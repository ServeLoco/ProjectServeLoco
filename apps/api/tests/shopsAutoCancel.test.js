/**
 * Auto-cancel when every shop on an order has rejected their items.
 */

const { pool } = require('../src/db/mysql');
const adminInbox = require('../src/utils/adminNotifications');
const notificationService = require('../src/utils/notificationService');
const realtimeEvents = require('../src/realtime/orderEvents');
const { maybeAutoCancelOrderWhenAllShopsRejected } = require('../src/utils/shops');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../src/utils/adminNotifications', () => ({
  TYPES: {
    ORDER_AUTO_CANCELLED: 'order_auto_cancelled',
  },
  createAdminNotification: jest.fn().mockResolvedValue({ id: 1 }),
}));

jest.mock('../src/utils/notificationService', () => ({
  createOrderNotification: jest.fn().mockResolvedValue({ insertId: 9 }),
}));

jest.mock('../src/realtime/orderEvents', () => ({
  emitNotificationCreated: jest.fn().mockResolvedValue(null),
  emitOrderStatusUpdated: jest.fn(),
}));

jest.mock('../src/utils/expoPush', () => ({
  sendPushToMany: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/realtime/socket', () => ({
  emitToCustomer: jest.fn(),
}));

const ORDER_ROW = {
  id: 42,
  order_number: 'ORD-42',
  customer_id: 5,
  status: 'Accepted',
  payment_method: 'Cash',
  coupon_id: null,
};

const makeConnection = (cancelAffectedRows = 1) => ({
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([{ affectedRows: cancelAffectedRows }]),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
});

describe('maybeAutoCancelOrderWhenAllShopsRejected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels the order when every shop has rejected', async () => {
    const connection = makeConnection(1);
    pool.getConnection.mockResolvedValue(connection);

    pool.query
      .mockResolvedValueOnce([[ORDER_ROW]])
      .mockResolvedValueOnce([[
        { shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' },
      ]])
      .mockResolvedValueOnce([[{
        ...ORDER_ROW,
        status: 'Cancelled',
        payment_status: 'Failed',
        cancel_reason: 'Sorry, the items on this order are currently unavailable. Please try ordering again.',
      }]])
      .mockResolvedValueOnce([[{ name: 'Burger Point' }]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result.status).toBe('Cancelled');
    expect(connection.query).toHaveBeenCalledWith(
      'UPDATE orders SET status = ?, payment_status = ?, cancel_reason = ? WHERE id = ? AND status = ?',
      [
        'Cancelled',
        'Failed',
        'Sorry, the items on this order are currently unavailable. Please try ordering again.',
        42,
        'Accepted',
      ]
    );
    expect(adminInbox.createAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order_auto_cancelled',
        title: expect.stringContaining('ORD-42'),
      })
    );
    expect(notificationService.createOrderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'status_cancelled', userId: 5 })
    );
    expect(realtimeEvents.emitOrderStatusUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Cancelled' })
    );
  });

  it('does not cancel when another shop still has pending items', async () => {
    pool.query
      .mockResolvedValueOnce([[ORDER_ROW]])
      .mockResolvedValueOnce([[
        { shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' },
        { shop_id: 2, shop_rejected_at: null },
      ]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result).toBeNull();
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(adminInbox.createAdminNotification).not.toHaveBeenCalled();
  });

  it('does not cancel orders with no shop-owned items', async () => {
    pool.query
      .mockResolvedValueOnce([[ORDER_ROW]])
      .mockResolvedValueOnce([[]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result).toBeNull();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('does not cancel orders that are not Accepted or Preparing', async () => {
    pool.query.mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Pending' }]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result).toBeNull();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('cancels Preparing orders when every shop has rejected', async () => {
    const connection = makeConnection(1);
    pool.getConnection.mockResolvedValue(connection);

    pool.query
      .mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Preparing' }]])
      .mockResolvedValueOnce([[
        { shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' },
        { shop_id: 2, shop_rejected_at: '2026-07-10 10:01:00' },
      ]])
      .mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Cancelled', payment_status: 'Failed' }]])
      .mockResolvedValueOnce([[{ name: 'Shop A' }, { name: 'Shop B' }]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result.status).toBe('Cancelled');
    expect(connection.query).toHaveBeenCalledWith(
      expect.any(String),
      ['Cancelled', 'Failed', 'Sorry, the items on this order are currently unavailable. Please try ordering again.', 42, 'Preparing']
    );
  });

  it('uses Refunded payment status for UPI orders', async () => {
    const connection = makeConnection(1);
    pool.getConnection.mockResolvedValue(connection);

    pool.query
      .mockResolvedValueOnce([[{ ...ORDER_ROW, payment_method: 'UPI' }]])
      .mockResolvedValueOnce([[{ shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' }]])
      .mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Cancelled', payment_status: 'Refunded' }]])
      .mockResolvedValueOnce([[{ name: 'Burger Point' }]]);

    await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(connection.query).toHaveBeenCalledWith(
      expect.any(String),
      ['Cancelled', 'Refunded', 'Sorry, the items on this order are currently unavailable. Please try ordering again.', 42, 'Accepted']
    );
  });

  it('restores coupon redemption inside the cancel transaction', async () => {
    const connection = makeConnection(1);
    pool.getConnection.mockResolvedValue(connection);

    pool.query
      .mockResolvedValueOnce([[{ ...ORDER_ROW, coupon_id: 99 }]])
      .mockResolvedValueOnce([[{ shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' }]])
      .mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Cancelled', coupon_id: 99 }]])
      .mockResolvedValueOnce([[{ name: 'Burger Point' }]]);

    await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(connection.query).toHaveBeenCalledWith(
      "UPDATE coupon_redemptions SET status = 'cancelled' WHERE order_id = ? AND coupon_id = ?",
      [42, 99]
    );
  });

  it('does not cancel when one shop confirmed and another only rejected', async () => {
    pool.query
      .mockResolvedValueOnce([[ORDER_ROW]])
      .mockResolvedValueOnce([[
        { shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' },
        { shop_id: 2, shop_rejected_at: null },
        { shop_id: 2, shop_rejected_at: null },
      ]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result).toBeNull();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('no-ops when the order was already cancelled by someone else', async () => {
    pool.query.mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Cancelled' }]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result).toBeNull();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('no-ops on concurrent cancel race (compare-and-set miss)', async () => {
    const connection = makeConnection(0);
    pool.getConnection.mockResolvedValue(connection);

    pool.query
      .mockResolvedValueOnce([[ORDER_ROW]])
      .mockResolvedValueOnce([[{ shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' }]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result).toBeNull();
    expect(connection.rollback).toHaveBeenCalled();
    expect(adminInbox.createAdminNotification).not.toHaveBeenCalled();
    expect(realtimeEvents.emitOrderStatusUpdated).not.toHaveBeenCalled();
  });

  it('ignores house items and only requires every shop bucket to be rejected', async () => {
    const connection = makeConnection(1);
    pool.getConnection.mockResolvedValue(connection);

    pool.query
      .mockResolvedValueOnce([[ORDER_ROW]])
      .mockResolvedValueOnce([[{ shop_id: 1, shop_rejected_at: '2026-07-10 10:00:00' }]])
      .mockResolvedValueOnce([[{ ...ORDER_ROW, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ name: 'Burger Point' }]]);

    const result = await maybeAutoCancelOrderWhenAllShopsRejected(42);

    expect(result.status).toBe('Cancelled');
  });
});