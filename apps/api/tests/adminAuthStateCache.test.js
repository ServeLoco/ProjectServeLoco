/**
 * utils/adminAuthState.js — the shared 10s cache behind requireAdmin's
 * revoked_before kill-switch check and its live admins-table re-check
 * (authMiddleware.js), mirrored on socket.js's authenticateSocket. Both were
 * separate, uncached, sequential queries on every single admin request
 * (~190ms of cross-region round trips per request).
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../src/db/mysql');
const {
  getRevokedBefore,
  getLiveAdminRow,
  bustRevokedBefore,
  bustLiveAdminRow,
  _resetCachesForTests,
} = require('../src/utils/adminAuthState');

describe('getRevokedBefore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCachesForTests();
  });

  it('reads admin_auth_state.revoked_before', async () => {
    pool.query.mockResolvedValueOnce([[{ revoked_before: '2026-01-01T00:00:00.000Z' }]]);

    const value = await getRevokedBefore();

    expect(value).toBe('2026-01-01T00:00:00.000Z');
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('SELECT revoked_before FROM admin_auth_state WHERE id = 1');
  });

  it('serves a second read from cache without touching the DB', async () => {
    pool.query.mockResolvedValueOnce([[{ revoked_before: null }]]);

    await getRevokedBefore();
    const second = await getRevokedBefore();

    expect(second).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('bustRevokedBefore() forces the next read back to the DB — a revoke must bite immediately', async () => {
    pool.query
      .mockResolvedValueOnce([[{ revoked_before: null }]])
      .mockResolvedValueOnce([[{ revoked_before: '2026-02-02T00:00:00.000Z' }]]);

    expect(await getRevokedBefore()).toBeNull();
    // What adminController.revokeSessions does right after the UPDATE.
    bustRevokedBefore();
    expect(await getRevokedBefore()).toBe('2026-02-02T00:00:00.000Z');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('normalizes a missing row to null rather than undefined', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await getRevokedBefore()).toBeNull();
  });

  it('does not cache a failed lookup — a DB blip must not poison the entry', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([[{ revoked_before: null }]]);

    await expect(getRevokedBefore()).rejects.toThrow('ECONNRESET');
    expect(await getRevokedBefore()).toBeNull();
  });
});

describe('getLiveAdminRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCachesForTests();
  });

  it('reads role/area_id/active for the given admin id', async () => {
    pool.query.mockResolvedValueOnce([[{ role: 'area_admin', area_id: 1, active: 1 }]]);

    const row = await getLiveAdminRow(4);

    expect(row).toEqual({ role: 'area_admin', area_id: 1, active: 1 });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('SELECT role, area_id, active FROM admins WHERE id = ?');
    expect(params).toEqual([4]);
  });

  it('serves a second read from cache without touching the DB', async () => {
    pool.query.mockResolvedValueOnce([[{ role: 'super_admin', area_id: null, active: 1 }]]);

    await getLiveAdminRow(4);
    const second = await getLiveAdminRow(4);

    expect(second).toEqual({ role: 'super_admin', area_id: null, active: 1 });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('caches per admin id, not globally', async () => {
    pool.query
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 1, active: 1 }]])
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 2, active: 1 }]]);

    expect((await getLiveAdminRow(4)).area_id).toBe(1);
    expect((await getLiveAdminRow(5)).area_id).toBe(2);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('bustLiveAdminRow(id) forces the next read back to the DB — a reassignment/deactivation must bite immediately', async () => {
    pool.query
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 1, active: 1 }]])
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 7, active: 1 }]]);

    expect((await getLiveAdminRow(4)).area_id).toBe(1);
    // What areaController.updateAdmin does right after the UPDATE commits.
    bustLiveAdminRow(4);
    expect((await getLiveAdminRow(4)).area_id).toBe(7);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('bustLiveAdminRow(id) only drops that admin, leaving others cached', async () => {
    pool.query
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 1, active: 1 }]])
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 2, active: 1 }]])
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 1, active: 0 }]]);

    await getLiveAdminRow(4);
    await getLiveAdminRow(5);
    bustLiveAdminRow(4);

    expect((await getLiveAdminRow(4)).active).toBe(0);
    expect((await getLiveAdminRow(5)).area_id).toBe(2); // still cached
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it('returns null for an admin id that does not exist', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await getLiveAdminRow(99999)).toBeNull();
  });

  it('does not cache a failed lookup — a DB blip must not poison the entry', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([[{ role: 'area_admin', area_id: 1, active: 1 }]]);

    await expect(getLiveAdminRow(4)).rejects.toThrow('ECONNRESET');
    expect((await getLiveAdminRow(4)).area_id).toBe(1);
  });
});
