/**
 * A shop can be auto-rejected or re-sent by an admin after a rider already
 * took the order. The assigned rider's app must hear about it
 * (rider.assignment.updated, no order in the payload, so it refetches) or the
 * map keeps routing them to a shop that is no longer part of the order.
 */

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../src/utils/shops', () => ({
  maybeAutoCancelOrderWhenAllShopsRejected: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
  emitToCustomer: jest.fn(),
}));

jest.mock('../src/realtime/sweepGates', () => ({
  shopAlerts: { wake: jest.fn() },
}));

jest.mock('../src/utils/notificationService', () => ({
  createOrderNotification: jest.fn().mockResolvedValue({ insertId: 1 }),
}));

jest.mock('../src/realtime/orderEvents', () => ({
  emitNotificationCreated: jest.fn(),
  emitOrderStatusUpdated: jest.fn(),
}));

jest.mock('../src/utils/adminNotifications', () => ({
  TYPES: { SHOP_REJECTED: 'shop_rejected' },
  createAdminNotification: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../src/services/riderAssignment', () => ({
  maybeStartRiderAssignment: jest.fn().mockResolvedValue({ started: false }),
}));

const { pool } = require('../src/db/mysql');
const { emitToCustomer } = require('../src/realtime/socket');
const { rejectShopOrder, resendShopOrder } = require('../src/services/shopOrderActions');

const riderEmits = () => emitToCustomer.mock.calls.filter(
  ([, event]) => event === 'rider.assignment.updated'
);

// guard SELECT, the shop_rejected_at UPDATE, the shop-owner lookup, then the
// assigned-rider lookup — the same order for reject and resend.
const queueCalls = (riderRows) => {
  pool.query.mockReset();
  pool.query
    .mockResolvedValueOnce([[{ cnt: 1, area_id: 7 }]])
    .mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ owner_user_id: 999 }]])
    .mockResolvedValueOnce([riderRows]);
};

describe('shop changes reach the assigned rider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tells the assigned rider when a shop rejects', async () => {
    queueCalls([{ user_id: 42 }]);

    const result = await rejectShopOrder(2, 139, { shopName: 'Hisar Corner Store' });

    expect(result.ok).toBe(true);
    expect(riderEmits()).toEqual([[42, 'rider.assignment.updated', {
      orderId: 139, order_id: 139, shopId: 2, shop_id: 2, reason: 'shop_rejected',
    }]]);
  });

  it('tells the assigned rider when an admin re-sends to a shop', async () => {
    queueCalls([{ user_id: 42 }]);

    const result = await resendShopOrder(2, 139, { shopName: 'Hisar Corner Store' });

    expect(result.ok).toBe(true);
    expect(riderEmits()).toEqual([[42, 'rider.assignment.updated', expect.objectContaining({
      orderId: 139, reason: 'shop_resent',
    })]]);
  });

  it('sends nothing to riders while no rider is assigned yet', async () => {
    queueCalls([]);

    await rejectShopOrder(2, 140, { shopName: 'X' });

    expect(riderEmits()).toEqual([]);
  });

  it('does not fail the reject when the rider lookup fails', async () => {
    pool.query.mockReset();
    pool.query
      .mockResolvedValueOnce([[{ cnt: 1, area_id: 7 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ owner_user_id: 999 }]])
      .mockRejectedValueOnce(new Error('db down'));

    const result = await rejectShopOrder(2, 141, { shopName: 'X' });

    expect(result.ok).toBe(true);
    expect(riderEmits()).toEqual([]);
  });
});
