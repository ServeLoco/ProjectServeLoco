import {
  getCached,
  setCached,
  isFresh,
  invalidate,
  clearAll,
  stableKey,
} from '../src/utils/apiCache';

describe('apiCache', () => {
  beforeEach(() => {
    clearAll();
  });

  test('set/get roundtrip', () => {
    setCached('categories:fast_food', [{ id: 1 }]);
    const hit = getCached('categories:fast_food');
    expect(hit).not.toBeNull();
    expect(hit.data).toEqual([{ id: 1 }]);
    expect(typeof hit.ageMs).toBe('number');
    expect(hit.ageMs).toBeGreaterThanOrEqual(0);
  });

  test('getCached returns null for missing key', () => {
    expect(getCached('missing')).toBeNull();
  });

  test('isFresh true when within maxAge, false when stale or missing', () => {
    expect(isFresh('nope', 1000)).toBe(false);
    setCached('product:1', { id: 1 });
    expect(isFresh('product:1', 60_000)).toBe(true);
    expect(isFresh('product:1', 0)).toBe(false);
  });

  test('invalidate-by-prefix deletes matching keys only', () => {
    setCached('products:a', [1]);
    setCached('products:b', [2]);
    setCached('product:9', { id: 9 });
    setCached('categories:x', []);
    invalidate('products:');
    expect(getCached('products:a')).toBeNull();
    expect(getCached('products:b')).toBeNull();
    expect(getCached('product:9')).not.toBeNull();
    expect(getCached('categories:x')).not.toBeNull();
  });

  test('stableKey is independent of key insertion order', () => {
    expect(stableKey({ b: 2, a: 1 })).toBe(stableKey({ a: 1, b: 2 }));
    expect(stableKey({ type: 'fast_food', limit: 30 })).toBe(
      '{"limit":30,"type":"fast_food"}',
    );
  });

  test('evicts oldest entry when exceeding 50', () => {
    for (let i = 0; i < 50; i += 1) {
      setCached(`k:${i}`, i);
    }
    expect(getCached('k:0')).not.toBeNull();
    setCached('k:50', 50);
    expect(getCached('k:0')).toBeNull();
    expect(getCached('k:1')).not.toBeNull();
    expect(getCached('k:50')).not.toBeNull();
  });

  test('re-set moves key to newest (not double-counted)', () => {
    for (let i = 0; i < 50; i += 1) {
      setCached(`k:${i}`, i);
    }
    setCached('k:0', 'refreshed');
    setCached('k:50', 50);
    // k:0 was refreshed so it is newest among the original set; k:1 is oldest
    expect(getCached('k:0')).not.toBeNull();
    expect(getCached('k:0').data).toBe('refreshed');
    expect(getCached('k:1')).toBeNull();
  });

  test('clearAll empties the cache', () => {
    setCached('a', 1);
    setCached('b', 2);
    clearAll();
    expect(getCached('a')).toBeNull();
    expect(getCached('b')).toBeNull();
  });
});
