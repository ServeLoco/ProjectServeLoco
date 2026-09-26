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
const { getUserState, getLiveAreaId, liveAreaIdOf, bustUserState, LIVE_AREA_FRESH_MS } = require('../src/utils/userState');

describe('getUserState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bustUserState();
  });

  it('reads blocked, last_area_id and the live area in ONE query and normalizes them', async () => {
    const seen = new Date('2026-09-26T10:00:00Z');
    pool.query.mockResolvedValueOnce([[{ blocked: 1, last_area_id: 3, current_area_id: 2, location_seen_at: seen }]]);

    const state = await getUserState(42);

    expect(state).toEqual({ blocked: true, lastAreaId: 3, currentAreaId: 2, locationSeenAt: seen });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('SELECT blocked, last_area_id, current_area_id, location_seen_at FROM users WHERE id = ?');
    expect(params).toEqual([42]);
  });

  it('serves a second read from cache without touching the DB', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1 }]]);

    await getUserState(42);
    const second = await getUserState(42);

    expect(second).toEqual({ blocked: false, lastAreaId: 1, currentAreaId: null, locationSeenAt: null });
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
    expect(await getUserState(42)).toEqual({ blocked: false, lastAreaId: null, currentAreaId: null, locationSeenAt: null });
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

describe('getLiveAreaId — the only stand-in for a request with no pin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bustUserState();
  });

  it('is the area the phone was last seen in, when recent', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1, current_area_id: 2, location_seen_at: new Date() }]]);
    expect(await getLiveAreaId(42)).toBe(2);
  });

  it('never falls back to the area of the last ORDER', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1, current_area_id: null, location_seen_at: null }]]);
    expect(await getLiveAreaId(42)).toBeNull();
  });

  it('a stale sighting does not count', () => {
    const now = Date.now();
    const state = { currentAreaId: 2, locationSeenAt: new Date(now - LIVE_AREA_FRESH_MS - 1000) };
    expect(liveAreaIdOf(state, now)).toBeNull();
    expect(liveAreaIdOf({ ...state, locationSeenAt: new Date(now - 60_000) }, now)).toBe(2);
  });

  it('no user id, no query', async () => {
    expect(await getLiveAreaId(null)).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
