/**
 * utils/userState.js — the shared 30s cache behind requireCustomer's `blocked`
 * gate and the no-pin `last_area_id` fallback. Both used to be separate,
 * uncached, sequential queries against the same row on every authenticated
 * request (~190ms of cross-region round trips per request).
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../src/db/mysql');
const { getUserState, bustUserState } = require('../src/utils/userState');

describe('getUserState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bustUserState();
  });

  it('reads blocked and last_area_id in ONE query and normalizes them', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 1, last_area_id: 3 }]]);

    const state = await getUserState(42);

    expect(state).toEqual({ blocked: true, lastAreaId: 3 });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('SELECT blocked, last_area_id FROM users WHERE id = ?');
    expect(params).toEqual([42]);
  });

  it('serves a second read from cache without touching the DB', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1 }]]);

    await getUserState(42);
    const second = await getUserState(42);

    expect(second).toEqual({ blocked: false, lastAreaId: 1 });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('caches per user id, not globally', async () => {
    pool.query
      .mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1 }]])
      .mockResolvedValueOnce([[{ blocked: 0, last_area_id: 2 }]]);

    expect((await getUserState(42)).lastAreaId).toBe(1);
    expect((await getUserState(43)).lastAreaId).toBe(2);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('bustUserState(id) forces the next read back to the DB', async () => {
    pool.query
      .mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1 }]])
      .mockResolvedValueOnce([[{ blocked: 1, last_area_id: 1 }]]);

    expect((await getUserState(42)).blocked).toBe(false);
    // What adminController does after UPDATE users SET blocked — a block must
    // bite on the very next request, not up to a TTL later.
    bustUserState(42);
    expect((await getUserState(42)).blocked).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('bustUserState(id) only drops that user, leaving others cached', async () => {
    pool.query
      .mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1 }]])
      .mockResolvedValueOnce([[{ blocked: 0, last_area_id: 2 }]])
      .mockResolvedValueOnce([[{ blocked: 1, last_area_id: 1 }]]);

    await getUserState(42);
    await getUserState(43);
    bustUserState(42);

    expect((await getUserState(42)).blocked).toBe(true);
    expect((await getUserState(43)).lastAreaId).toBe(2); // still cached
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it('null last_area_id normalizes to null, not 0', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: null }]]);
    expect(await getUserState(42)).toEqual({ blocked: false, lastAreaId: null });
  });

  it('returns null for a user row that does not exist', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await getUserState(99999)).toBeNull();
  });

  it('does not cache a failed lookup — a DB blip must not poison the entry', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce([[{ blocked: 0, last_area_id: 4 }]]);

    await expect(getUserState(42)).rejects.toThrow('ECONNRESET');
    expect((await getUserState(42)).lastAreaId).toBe(4);
  });
});
