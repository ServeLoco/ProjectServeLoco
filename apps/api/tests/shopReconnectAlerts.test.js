/**
 * resendPendingShopAlerts — the reconnect path.
 *
 * A shop owner whose phone had no signal when their order was accepted misses
 * the one-shot fan-out. Their socket connecting is the first proof the device
 * is reachable again, so the server hands them every still-unconfirmed order
 * right then instead of waiting for shopAlertSweeper's next due tick.
 */

const { pool } = require('../src/db/mysql');
const { emitToCustomer } = require('../src/realtime/socket');
const { resendPendingShopAlerts } = require('../src/utils/shops');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../src/realtime/socket', () => ({
  emitToCustomer: jest.fn(),
}));

describe('resendPendingShopAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('re-emits shop.order.assigned for every order still waiting on this owner', async () => {
    pool.query.mockResolvedValueOnce([[
      { order_id: 51, order_number: 'ORD-51', shop_id: 7 },
      { order_id: 52, order_number: 'ORD-52', shop_id: 7 },
    ]]);

    await resendPendingShopAlerts(601);

    expect(emitToCustomer).toHaveBeenCalledTimes(2);
    expect(emitToCustomer).toHaveBeenCalledWith(601, 'shop.order.assigned', {
      orderId: 51, orderNumber: 'ORD-51', shopId: 7,
    });
    expect(emitToCustomer).toHaveBeenCalledWith(601, 'shop.order.assigned', {
      orderId: 52, orderNumber: 'ORD-52', shopId: 7,
    });
  });

  it('scopes to unconfirmed, unrejected items on live orders owned by this user', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await resendPendingShopAlerts(601);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/s\.owner_user_id = \?/);
    expect(sql).toMatch(/s\.active = 1/);
    expect(sql).toMatch(/o\.status IN \('Accepted', 'Preparing'\)/);
    expect(sql).toMatch(/oi\.shop_confirmed_at IS NULL/);
    expect(sql).toMatch(/oi\.shop_rejected_at IS NULL/);
    expect(params).toEqual([601]);
  });

  it('emits nothing when the owner has no waiting orders', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await resendPendingShopAlerts(601);

    expect(emitToCustomer).not.toHaveBeenCalled();
  });

  it('no-ops without a user id, never touching the DB', async () => {
    await resendPendingShopAlerts(null);

    expect(pool.query).not.toHaveBeenCalled();
    expect(emitToCustomer).not.toHaveBeenCalled();
  });

  // Runs on every customer socket connect — a DB blip there must never take
  // the connection handler down with it.
  it('swallows a query failure', async () => {
    pool.query.mockRejectedValueOnce(new Error('db blip'));

    await expect(resendPendingShopAlerts(601)).resolves.toBeUndefined();
    expect(emitToCustomer).not.toHaveBeenCalled();
  });
});
