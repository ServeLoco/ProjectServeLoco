/**
 * notifyShopsForOrder — the accepted-order-to-ringing-phone path.
 *
 * Everything here exists to keep round trips off that path: the DB is a region
 * away in production, so each serial query between the accept and the alarm is
 * latency a shop owner feels. These tests pin the shape that keeps it short.
 */

const { pool } = require('../src/db/mysql');
const { emitToCustomer } = require('../src/realtime/socket');
const fcmAlarm = require('../src/utils/fcmAlarmPush');
const expoPush = require('../src/utils/expoPush');
const { notifyShopsForOrder } = require('../src/utils/shops');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../src/realtime/socket', () => ({
  emitToCustomer: jest.fn(),
}));

jest.mock('../src/utils/fcmAlarmPush', () => ({
  sendFcmDataOnlyToUser: jest.fn().mockResolvedValue({ sent: true }),
}));

jest.mock('../src/utils/expoPush', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(null),
}));

const ORDER = { id: 77, order_number: 'ORD-77' };

// The two reads (shops + payable totals) both go out first and only need
// order.id; the bookkeeping UPDATE resolves after. Routed by SQL rather than
// call order precisely because the reads are concurrent.
const mockQueries = ({ shops, totals }) => {
  pool.query.mockImplementation(async (sql) => {
    if (/FROM order_items oi/.test(sql) && /JOIN shops s/.test(sql)) return [shops];
    if (/SUM\(shop_line_total\)/.test(sql)) return [totals];
    if (/^UPDATE order_items/.test(sql.trim())) return [{ affectedRows: shops.length }];
    throw new Error(`unexpected query: ${sql}`);
  });
};

describe('notifyShopsForOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('sends the alarm with the token from the shop lookup, never a second lookup per owner', async () => {
    mockQueries({
      shops: [{ shop_id: 3, shop_name: 'Shop A', owner_user_id: 601, owner_fcm_token: 'tok-601' }],
      totals: [{ shop_id: 3, total: '244.00' }],
    });

    await notifyShopsForOrder(ORDER);

    expect(fcmAlarm.sendFcmDataOnlyToUser).toHaveBeenCalledWith(
      pool,
      601,
      expect.objectContaining({
        type: 'shop_order',
        alertType: 'new_order_alarm',
        orderId: 77,
        orderNumber: 'ORD-77',
        total: '244',
      }),
      { token: 'tok-601' }
    );
    // No SELECT against users — the token came back on the shop lookup.
    const sqls = pool.query.mock.calls.map(([sql]) => sql);
    expect(sqls.some((sql) => /FROM users/.test(sql))).toBe(false);
  });

  it('emits the socket event to every owner before any push resolves', async () => {
    mockQueries({
      shops: [
        { shop_id: 3, shop_name: 'A', owner_user_id: 601, owner_fcm_token: 'tok-601' },
        { shop_id: 4, shop_name: 'B', owner_user_id: 602, owner_fcm_token: 'tok-602' },
      ],
      totals: [{ shop_id: 3, total: '100.00' }, { shop_id: 4, total: '50.00' }],
    });

    await notifyShopsForOrder(ORDER);

    expect(emitToCustomer).toHaveBeenCalledWith(601, 'shop.order.assigned', {
      orderId: 77, orderNumber: 'ORD-77', shopId: 3,
    });
    expect(emitToCustomer).toHaveBeenCalledWith(602, 'shop.order.assigned', {
      orderId: 77, orderNumber: 'ORD-77', shopId: 4,
    });
  });

  it('pays each shop its own total on a multi-shop order', async () => {
    mockQueries({
      shops: [
        { shop_id: 3, shop_name: 'A', owner_user_id: 601, owner_fcm_token: 'tok-601' },
        { shop_id: 4, shop_name: 'B', owner_user_id: 602, owner_fcm_token: 'tok-602' },
      ],
      totals: [{ shop_id: 3, total: '100.00' }, { shop_id: 4, total: '50.00' }],
    });

    await notifyShopsForOrder(ORDER);

    expect(fcmAlarm.sendFcmDataOnlyToUser).toHaveBeenCalledWith(
      pool, 601, expect.objectContaining({ total: '100' }), { token: 'tok-601' }
    );
    expect(fcmAlarm.sendFcmDataOnlyToUser).toHaveBeenCalledWith(
      pool, 602, expect.objectContaining({ total: '50' }), { token: 'tok-602' }
    );
  });

  it('sends an empty total rather than "₹0" when nothing is priced yet', async () => {
    mockQueries({
      shops: [{ shop_id: 3, shop_name: 'A', owner_user_id: 601, owner_fcm_token: 'tok-601' }],
      totals: [{ shop_id: 3, total: '0.00' }],
    });

    await notifyShopsForOrder(ORDER);

    expect(fcmAlarm.sendFcmDataOnlyToUser).toHaveBeenCalledWith(
      pool, 601, expect.objectContaining({ total: '' }), { token: 'tok-601' }
    );
  });

  it('falls back to the Expo tray when the owner has no FCM token', async () => {
    fcmAlarm.sendFcmDataOnlyToUser.mockResolvedValueOnce({ sent: false, reason: 'no_fcm_token' });
    mockQueries({
      shops: [{ shop_id: 3, shop_name: 'A', owner_user_id: 601, owner_fcm_token: null }],
      totals: [{ shop_id: 3, total: '244.00' }],
    });

    await notifyShopsForOrder(ORDER);

    expect(expoPush.sendPushToUser).toHaveBeenCalledWith(
      pool, 601, expect.objectContaining({ title: 'New order to prepare' })
    );
  });

  it('still stamps shop_last_notified_at so the sweeper throttles from this push', async () => {
    mockQueries({
      shops: [{ shop_id: 3, shop_name: 'A', owner_user_id: 601, owner_fcm_token: 'tok-601' }],
      totals: [{ shop_id: 3, total: '244.00' }],
    });

    await notifyShopsForOrder(ORDER);

    const stamp = pool.query.mock.calls.find(([sql]) => /^UPDATE order_items/.test(sql.trim()));
    expect(stamp).toBeTruthy();
    expect(stamp[0]).toMatch(/shop_notify_count = shop_notify_count \+ 1/);
    expect(stamp[1]).toEqual([77, [3]]);
  });

  it('never throws when the shop lookup fails — callers are on order-status paths', async () => {
    pool.query.mockRejectedValue(new Error('db blip'));

    await expect(notifyShopsForOrder(ORDER)).resolves.toBeUndefined();
    expect(fcmAlarm.sendFcmDataOnlyToUser).not.toHaveBeenCalled();
  });
});
