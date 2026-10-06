/**
 * "How was your food?" prompt (services/ratingPrompts.js) and the push data
 * it produces (utils/notificationService.js sendDevicePush).
 */
const { pool } = require('../src/db/mysql');
const expoPush = require('../src/utils/expoPush');
const realtimeEvents = require('../src/realtime/orderEvents');
const { listAreas } = require('../src/utils/areaScope');
const notificationService = require('../src/utils/notificationService');
const { sendDueRatingPrompts } = require('../src/services/ratingPrompts');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/utils/expoPush', () => ({
  sendPushToUser: jest.fn().mockResolvedValue({ sent: true }),
  sendPushToMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../src/realtime/orderEvents', () => ({
  emitNotificationCreated: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/utils/areaScope', () => ({
  listAreas: jest.fn(),
}));

const dueOrder = (overrides = {}) => ({
  id: 40,
  order_number: 'ORD-40',
  customer_id: 7,
  order_date: '2026-10-06',
  ...overrides,
});

describe('sendDueRatingPrompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
    listAreas.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it('checks every area with an area-scoped lookup and prompts each due order once', async () => {
    pool.query
      .mockResolvedValueOnce([[dueOrder()]]) // area 1 lookup
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 77 }]) // notification insert
      .mockResolvedValueOnce([[]]); // area 2 lookup

    const sent = await sendDueRatingPrompts({ delayMinutes: 30 });

    expect(sent).toBe(1);

    const [lookupSql, lookupParams] = pool.query.mock.calls[0];
    expect(lookupSql).toMatch(/WHERE o\.area_id = \? AND o\.status = 'Delivered'/);
    expect(lookupSql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM order_item_ratings r/);
    expect(lookupSql).toMatch(/n\.event_key = \?/);
    expect(lookupParams).toEqual([1, 30, 180, 'rate_prompt', 100]);
    expect(pool.query.mock.calls[2][1][0]).toBe(2);

    const [insertSql, insertParams] = pool.query.mock.calls[1];
    expect(insertSql).toMatch(/INSERT IGNORE INTO notifications/);
    // user_id, title, body, type, source_type, source_id, event_key,
    // batch_id, action_type, action_payload, created_by_admin_id
    expect(insertParams[0]).toBe(7);
    expect(insertParams[1]).toBe('⭐ How was your food?');
    expect(insertParams[2]).toContain('#ORD-40');
    expect(insertParams.slice(3, 7)).toEqual(['info', 'order', 40, 'rate_prompt']);
    expect(insertParams[8]).toBe('rate_order');
    expect(JSON.parse(insertParams[9])).toEqual({ orderId: 40, orderNumber: 'ORD-40', orderDate: '2026-10-06' });

    expect(expoPush.sendPushToUser).toHaveBeenCalledWith(pool, 7, expect.objectContaining({
      title: '⭐ How was your food?',
      data: {
        type: 'info',
        notificationId: '77',
        orderId: '40',
        orderNumber: 'ORD-40',
        action: 'rate_order',
        orderDate: '2026-10-06',
      },
      categoryId: 'order_update',
    }));
    expect(realtimeEvents.emitNotificationCreated).toHaveBeenCalledWith(7, { affectedRows: 1, insertId: 77 });
  });

  it('sends nothing when no order is due', async () => {
    pool.query.mockResolvedValue([[]]);

    const sent = await sendDueRatingPrompts({ delayMinutes: 30 });

    expect(sent).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(expoPush.sendPushToUser).not.toHaveBeenCalled();
  });

  it('does not push again when the notification row already exists', async () => {
    listAreas.mockResolvedValue([{ id: 1 }]);
    pool.query
      .mockResolvedValueOnce([[dueOrder()]])
      .mockResolvedValueOnce([{ affectedRows: 0, insertId: 0 }]); // INSERT IGNORE deduped

    const sent = await sendDueRatingPrompts({ delayMinutes: 30 });

    expect(sent).toBe(0);
    expect(expoPush.sendPushToUser).not.toHaveBeenCalled();
  });

  it('keeps going when one area lookup fails', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('lookup timeout')) // area 1
      .mockResolvedValueOnce([[dueOrder({ id: 41, customer_id: 8 })]]) // area 2
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 78 }]);

    const sent = await sendDueRatingPrompts({ delayMinutes: 30 });

    expect(sent).toBe(1);
    expect(expoPush.sendPushToUser).toHaveBeenCalledWith(pool, 8, expect.any(Object));
  });

  it('keeps going when one order fails', async () => {
    listAreas.mockResolvedValue([{ id: 1 }]);
    realtimeEvents.emitNotificationCreated.mockRejectedValueOnce(new Error('socket down'));
    pool.query
      .mockResolvedValueOnce([[dueOrder(), dueOrder({ id: 41, customer_id: 8 })]])
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 77 }])
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 78 }]);

    const sent = await sendDueRatingPrompts({ delayMinutes: 30 });

    expect(sent).toBe(1);
    expect(expoPush.sendPushToUser).toHaveBeenCalledTimes(2);
  });
});

describe('order push data', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('keeps the Delivered push exactly as before (no action field)', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // no admin template -> built-in text
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 90 }]);

    await notificationService.createOrderNotification({
      userId: 7,
      order: { id: 40, order_number: 'ORD-40' },
      event: 'status_delivered',
    });

    expect(expoPush.sendPushToUser).toHaveBeenCalledWith(pool, 7, expect.objectContaining({
      data: { type: 'success', notificationId: '90', orderId: '40', orderNumber: 'ORD-40' },
    }));
  });
});
