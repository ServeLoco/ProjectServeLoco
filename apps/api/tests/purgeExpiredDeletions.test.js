const { pool } = require('../src/db/mysql');

// Mock the MySQL pool so purgeExpiredDeletions runs without a real DB.
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

// Mock MongoDB so requiring server.js (which loads ./db) is side-effect free.
jest.mock('../src/db/mongodb', () => ({
  connect: jest.fn().mockResolvedValue(),
  close: jest.fn().mockResolvedValue(),
  checkConnection: jest.fn().mockResolvedValue(true),
  getDb: jest.fn()
}));

// server.js only auto-starts when run directly (`node src/server.js`); under
// Jest require.main !== module so startServer() does not run. We require it
// purely to exercise purgeExpiredDeletions in isolation against a mocked pool.
const { purgeExpiredDeletions } = require('../src/server');

describe('purgeExpiredDeletions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('anonymizes expired users who have orders and hard-deletes those without, keeping order rows', async () => {
    // Two expired users: id 10 has one order (→ anonymize), id 20 has none (→ hard delete).
    pool.query
      .mockResolvedValueOnce([[{ id: 10 }, { id: 20 }]]) // SELECT expired user ids
      .mockResolvedValueOnce([{}]) // DELETE password_reset_requests (user 10)
      .mockResolvedValueOnce([[{ cnt: 1 }]]) // COUNT orders for user 10 → has order
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users anonymize user 10
      .mockResolvedValueOnce([{}]) // DELETE password_reset_requests (user 20)
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // COUNT orders for user 20 → no orders
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE users hard-delete user 20

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await purgeExpiredDeletions();

    const calls = pool.query.mock.calls.map(([sql]) => sql);

    // User 10 had an order → must be anonymized, never hard-deleted.
    const anonymizeCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /UPDATE users SET/i.test(sql)
    );
    expect(anonymizeCall).toBeTruthy();
    expect(anonymizeCall[0]).toMatch(/name = 'Deleted User'/i);
    expect(anonymizeCall[0]).toMatch(/CONCAT\('deleted-', id\)/i);
    expect(anonymizeCall[0]).toMatch(/blocked = 1/i);
    expect(anonymizeCall[1]).toEqual([10]); // anonymize targeted user 10

    // User 20 had no orders → hard-deleted via a per-id DELETE.
    const deleteUserCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /DELETE FROM users WHERE id = \?/i.test(sql)
    );
    expect(deleteUserCall).toBeTruthy();
    expect(deleteUserCall[1]).toEqual([20]);

    // The old batched `DELETE ... IN (?)` is gone — every delete/update is per user.
    const batchedUserDelete = calls.find((sql) => /DELETE FROM users WHERE id IN \(/i.test(sql));
    expect(batchedUserDelete).toBeUndefined();

    // Order rows must survive: no DELETE FROM orders is ever issued.
    const deleteOrdersCall = calls.find((sql) => /DELETE FROM orders/i.test(sql));
    expect(deleteOrdersCall).toBeUndefined();

    // blocked users are now purgeable — the SELECT must not filter on blocked.
    const selectCall = pool.query.mock.calls[0][0];
    expect(selectCall).toMatch(/deletion_requested_at < \(NOW\(\) - INTERVAL 30 DAY\)/i);
    expect(selectCall).not.toMatch(/blocked = 0/i);

    // Log reports both counts.
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/hard-deleted 1, anonymized 1 user\(s\)/)
    );

    logSpy.mockRestore();
  });

  it('does nothing when there are no expired users', async () => {
    pool.query.mockResolvedValueOnce([[]]); // SELECT expired user ids → none
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await purgeExpiredDeletions();

    // Only the initial SELECT ran; no DELETE/UPDATE was issued.
    expect(pool.query.mock.calls).toHaveLength(1);
    logSpy.mockRestore();
  });
});
