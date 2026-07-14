/**
 * TASK 8 — shop/customer notify helpers for rider events.
 */
const { pool } = require('../src/db/mysql');
const { emitToCustomer } = require('../src/realtime/socket');
const expoPush = require('../src/utils/expoPush');
const {
  notifyShopsRiderAssigned,
  notifyShopsRiderAssignmentFailed,
  notifyShopsOrderStatusChanged,
} = require('../src/utils/shops');
const notificationService = require('../src/utils/notificationService');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToCustomer: jest.fn(),
  emitToAdmins: jest.fn(),
  emitToAllCustomers: jest.fn(),
}));
jest.mock('../src/utils/expoPush', () => ({
  sendPushToMany: jest.fn().mockResolvedValue({}),
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

describe('rider shop notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('notifyShopsRiderAssigned pushes owners', async () => {
    pool.query.mockResolvedValueOnce([[
      { shop_id: 1, shop_name: 'A', owner_user_id: 20 },
      { shop_id: 2, shop_name: 'B', owner_user_id: 21 },
    ]]);

    await notifyShopsRiderAssigned({ id: 10, order_number: 'ORD-10' });

    expect(emitToCustomer).toHaveBeenCalledWith(20, 'shop.order.rider_assigned', expect.any(Object));
    expect(emitToCustomer).toHaveBeenCalledWith(21, 'shop.order.rider_assigned', expect.any(Object));
    expect(expoPush.sendPushToMany).toHaveBeenCalledWith(
      pool,
      [20, 21],
      expect.objectContaining({ title: 'Rider assigned' })
    );
  });

  it('notifyShopsRiderAssignmentFailed pushes owners', async () => {
    pool.query.mockResolvedValueOnce([[
      { shop_id: 1, shop_name: 'A', owner_user_id: 20 },
    ]]);

    await notifyShopsRiderAssignmentFailed({ id: 11, order_number: 'ORD-11' });

    expect(emitToCustomer).toHaveBeenCalledWith(20, 'shop.order.rider_failed', expect.any(Object));
    expect(expoPush.sendPushToMany).toHaveBeenCalledWith(
      pool,
      [20],
      expect.objectContaining({ title: 'No rider available' })
    );
  });

  it('no-ops when no shops', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    await notifyShopsRiderAssigned({ id: 1, order_number: 'X' });
    expect(emitToCustomer).not.toHaveBeenCalled();
  });

  it('notifyShopsOrderStatusChanged emits shop.order.updated to owners', async () => {
    pool.query.mockResolvedValueOnce([[
      { shop_id: 1, owner_user_id: 20 },
      { shop_id: 2, owner_user_id: 21 },
    ]]);

    await notifyShopsOrderStatusChanged({
      id: 12,
      order_number: 'ORD-12',
      status: 'Delivered',
    });

    expect(emitToCustomer).toHaveBeenCalledWith(20, 'shop.order.updated', expect.objectContaining({
      orderId: 12,
      status: 'Delivered',
      action: 'status',
      shopId: 1,
    }));
    expect(emitToCustomer).toHaveBeenCalledWith(21, 'shop.order.updated', expect.objectContaining({
      orderId: 12,
      status: 'Delivered',
      action: 'status',
    }));
  });
});

describe('rider customer notification fallbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('createOrderNotification supports rider_assigned fallback', async () => {
    // template lookup fails/empty → fallback
    pool.query
      .mockResolvedValueOnce([[]]) // templates
      .mockResolvedValueOnce([{ insertId: 1, affectedRows: 1 }]); // insert notification

    const result = await notificationService.createOrderNotification({
      userId: 5,
      order: { id: 10, order_number: 'O' },
      event: 'rider_assigned',
    });

    // insert was attempted (not null from default return)
    expect(pool.query).toHaveBeenCalled();
    // second call is INSERT IGNORE notifications
    const insertSql = String(pool.query.mock.calls[1]?.[0] || '');
    expect(insertSql).toMatch(/INSERT IGNORE INTO notifications/i);
    expect(result).toBeTruthy();
  });
});
