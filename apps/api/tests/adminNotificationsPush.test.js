/**
 * ADMIN TASK 4 — new-order admin notifications fan out an Expo push to
 * active mobile admin devices (in addition to the existing socket emit).
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
}));
jest.mock('../src/utils/expoPush', () => ({
  sendPushToMany: jest.fn().mockResolvedValue({ recipients: 0, tokensFound: 0, sent: 0, failed: 0 }),
}));

const { pool } = require('../src/db/mysql');
const { sendPushToMany } = require('../src/utils/expoPush');
const { createAdminNotification, TYPES } = require('../src/utils/adminNotifications');

describe('createAdminNotification — mobile admin push fan-out', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  // broadcastUnreadCount() still fires un-awaited (pre-existing pattern) right
  // before the push fan-out — its getUnreadCount query is the 3rd pool.query
  // call in invocation order, ahead of the (now awaited) push fan-out query.
  it('pushes to active mobile admins with a user_id on a new order', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }]) // INSERT IGNORE admin_notifications
      .mockResolvedValueOnce([[{ id: 42, type: TYPES.NEW_ORDER, title: 'New order #7', body: 'x', related_url: null, related_id: '7', read_at: null, created_at: null }]]) // re-select
      .mockResolvedValueOnce([[{ n: 0 }]]) // broadcastUnreadCount's getUnreadCount (fire-and-forget)
      .mockResolvedValueOnce([[{ user_id: 5 }, { user_id: 8 }]]); // active mobile_admins with user_id

    await createAdminNotification({
      type: TYPES.NEW_ORDER,
      title: 'New order #7',
      body: 'x',
      relatedId: '7',
    });

    expect(sendPushToMany).toHaveBeenCalledWith(pool, [5, 8], {
      title: 'New order #7',
      body: 'x',
      data: { type: TYPES.NEW_ORDER, orderId: '7' },
    });
  });

  it('does not push for non-order notification types', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 1 }])
      .mockResolvedValueOnce([[{ id: 1, type: TYPES.NEW_CUSTOMER, title: 't', body: 'b', related_url: null, related_id: null, read_at: null, created_at: null }]])
      .mockResolvedValueOnce([[{ n: 0 }]]); // broadcastUnreadCount

    await createAdminNotification({ type: TYPES.NEW_CUSTOMER, title: 't', body: 'b' });

    expect(sendPushToMany).not.toHaveBeenCalled();
  });

  it('does not push on a duplicate (INSERT IGNORE no-op)', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const result = await createAdminNotification({ type: TYPES.NEW_ORDER, title: 't', body: 'b', relatedId: '7' });

    expect(result).toBeNull();
    expect(sendPushToMany).not.toHaveBeenCalled();
  });

  it('skips push entirely when no mobile admin has a linked user_id', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }])
      .mockResolvedValueOnce([[{ id: 42, type: TYPES.NEW_ORDER, title: 't', body: 'b', related_url: null, related_id: '7', read_at: null, created_at: null }]])
      .mockResolvedValueOnce([[{ n: 0 }]]) // broadcastUnreadCount
      .mockResolvedValueOnce([[]]); // no active mobile admins with user_id

    await createAdminNotification({ type: TYPES.NEW_ORDER, title: 't', body: 'b', relatedId: '7' });

    expect(sendPushToMany).not.toHaveBeenCalled();
  });
});
