jest.mock('../src/db/mysql', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../src/utils/adminNotifications', () => ({
  TYPES: { SHOP_NOT_RESPONDING: 'shop_not_responding' },
  insertAdminNotification: jest.fn(),
  publishAdminNotification: jest.fn(),
}));
const { pool } = require('../src/db/mysql');
const adminInbox = require('../src/utils/adminNotifications');
const { escalatePendingShopOrder } = require('../src/services/shopOrderEscalation');

describe('shop order admin escalation', () => {
  let connection;
  const acceptedAt = new Date('2026-10-10T01:00:00Z');
  beforeEach(() => {
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      query: jest.fn()
        .mockResolvedValueOnce([[{ id: 50, order_number: 'ORD-50', area_id: 7, status: 'Accepted', accepted_at: acceptedAt }]])
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([[{ alert_cycle: '20261010010000' }]]),
    };
    pool.getConnection.mockResolvedValue(connection);
    adminInbox.insertAdminNotification.mockReset().mockResolvedValue({ id: 1 });
  });

  it('atomically records the escalation and notification, then publishes to the correct order after commit', async () => {
    await escalatePendingShopOrder(50, 2, 'Tea Stall');
    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('FOR UPDATE'), [50]);
    const [sql, params] = connection.query.mock.calls[1];
    expect(sql).toContain('shop_admin_alerted_at IS NULL');
    expect(sql).toContain('shop_confirmed_at IS NULL AND shop_rejected_at IS NULL');
    expect(params).toEqual([50, 2, acceptedAt, 180, acceptedAt, 1800]);
    expect(adminInbox.insertAdminNotification).toHaveBeenCalledWith(connection, expect.objectContaining({
      type: 'shop_not_responding', areaId: 7, relatedUrl: '/orders?id=50',
      relatedId: '50-2-20261010010000',
      body: expect.stringContaining('after 3 minutes'),
    }));
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(adminInbox.insertAdminNotification.mock.invocationCallOrder[0]).toBeLessThan(connection.commit.mock.invocationCallOrder[0]);
    expect(connection.commit.mock.invocationCallOrder[0]).toBeLessThan(adminInbox.publishAdminNotification.mock.invocationCallOrder[0]);
    expect(adminInbox.publishAdminNotification).toHaveBeenCalledWith({ id: 1 }, { orderId: '50' });
    expect(connection.release).toHaveBeenCalled();
  });

  it.each(['Cancelled', 'Delivered', 'Pending'])('does not alert for a stale %s order', async status => {
    connection.query.mockReset().mockResolvedValueOnce([[{ status, accepted_at: acceptedAt }]]);
    await escalatePendingShopOrder(50, 2, 'Tea Stall');
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(adminInbox.insertAdminNotification).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });

  it('skips a resolved, already escalated, newly resent or timed-out shop when the locked claim finds no due items', async () => {
    connection.query.mockReset()
      .mockResolvedValueOnce([[{ id: 50, status: 'Preparing', accepted_at: acceptedAt }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    await escalatePendingShopOrder(50, 2, 'Tea Stall');
    expect(adminInbox.insertAdminNotification).not.toHaveBeenCalled();
    expect(adminInbox.publishAdminNotification).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
  });

  it('rolls back the marker on notification failure so a later sweep can retry', async () => {
    adminInbox.insertAdminNotification.mockRejectedValueOnce(new Error('write failed'));
    await expect(escalatePendingShopOrder(50, 2, 'Tea Stall')).rejects.toThrow('write failed');
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(adminInbox.publishAdminNotification).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });

  it('commits the marker without republishing an existing deduplicated inbox row', async () => {
    adminInbox.insertAdminNotification.mockResolvedValueOnce(null);
    expect(await escalatePendingShopOrder(50, 2, 'Tea Stall')).toBeNull();
    expect(connection.commit).toHaveBeenCalled();
    expect(adminInbox.publishAdminNotification).not.toHaveBeenCalled();
  });
});
