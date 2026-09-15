/**
 * Platform-level admin notifications (admin_notifications.area_id IS NULL).
 *
 * A new-customer signup happens before any pin exists, so it belongs to no
 * area — and there is no default area to borrow, because every area is an
 * equal tenant with its own team. Attributing it to whichever area was
 * flagged default put every new customer's name and phone into that one
 * team's inbox. NULL makes it platform-level: visible in the admin panel's
 * "All areas" view, invisible to any single area.
 */
jest.mock('../src/db/mysql', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
  emitToPlatformAdmins: jest.fn(),
}));
jest.mock('../src/utils/expoPush', () => ({
  sendPushToMany: jest.fn().mockResolvedValue({ recipients: 0, tokensFound: 0, sent: 0, failed: 0 }),
}));

const { pool } = require('../src/db/mysql');
const { emitToAdmins, emitToPlatformAdmins } = require('../src/realtime/socket');
const { sendPushToMany } = require('../src/utils/expoPush');
const { createAdminNotification, TYPES } = require('../src/utils/adminNotifications');

const flushAsync = () => new Promise(setImmediate);

const ROW = (areaId) => ({
  id: 42, area_id: areaId, type: TYPES.NEW_CUSTOMER, title: 'New customer signed up',
  body: 'Asha (9990001111) just created an account via OTP',
  related_url: '/customers?id=9', related_id: '9', read_at: null, created_at: null,
});

const signup = (areaId) => createAdminNotification({
  type: TYPES.NEW_CUSTOMER,
  title: 'New customer signed up',
  body: 'Asha (9990001111) just created an account via OTP',
  relatedUrl: '/customers?id=9',
  relatedId: '9',
  areaId,
});

describe('createAdminNotification — platform-level (areaId null)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('writes a NULL area_id rather than borrowing a default area', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }])
      .mockResolvedValueOnce([[ROW(null)]])
      .mockResolvedValueOnce([[{ n: 3 }]]);

    await signup(null);
    await flushAsync();

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE INTO admin_notifications');
    expect(params[0]).toBeNull();
  });

  it('emits to the platform room, never to an area room', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }])
      .mockResolvedValueOnce([[ROW(null)]])
      .mockResolvedValueOnce([[{ n: 3 }]]);

    await signup(null);
    await flushAsync();

    expect(emitToPlatformAdmins).toHaveBeenCalledWith(
      'admin.notification.created', expect.objectContaining({ id: 42 }),
    );
    expect(emitToAdmins).not.toHaveBeenCalled();
  });

  // A scoped count would be `area_id = NULL`, which matches nothing — it
  // would push a badge of 0 into a room nobody is in.
  it('broadcasts the unscoped unread total to the platform room', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }])
      .mockResolvedValueOnce([[ROW(null)]])
      .mockResolvedValueOnce([[{ n: 3 }]]);

    await signup(null);
    await flushAsync();

    const countCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('COUNT(*)'),
    );
    expect(countCall[0]).not.toContain('area_id = ?');
    expect(emitToPlatformAdmins).toHaveBeenCalledWith(
      'admin.notification.unread_count', { count: 3 },
    );
  });

  // Every mobile_admins row is area-bound, so there is no audience — and
  // querying `area_id = NULL` would silently return nothing anyway.
  it('sends no mobile push and runs no mobile_admins query', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }])
      .mockResolvedValueOnce([[ROW(null)]])
      .mockResolvedValueOnce([[{ n: 3 }]]);

    await signup(null);
    await flushAsync();

    expect(sendPushToMany).not.toHaveBeenCalled();
    expect(pool.query.mock.calls.some(
      ([sql]) => typeof sql === 'string' && sql.includes('mobile_admins'),
    )).toBe(false);
  });

  it('REGRESSION: a real area still routes to that area, untouched', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 42 }])
      .mockResolvedValueOnce([[ROW(2)]])
      .mockResolvedValueOnce([[{ n: 1 }]])
      .mockResolvedValueOnce([[{ user_id: 5 }]]);

    await signup(2);
    await flushAsync();

    expect(emitToAdmins).toHaveBeenCalledWith(
      2, 'admin.notification.created', expect.objectContaining({ id: 42 }),
    );
    expect(emitToPlatformAdmins).not.toHaveBeenCalled();
    expect(sendPushToMany).toHaveBeenCalled();
  });
});
