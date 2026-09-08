/**
 * ttlCache
 * Tiny in-process TTL cache for read-mostly endpoints (settings, categories).
 * Avoids adding a dep (lru-cache) since we only need a few keys with simple
 * time-based eviction — not an LRU. Swapping to a distributed cache later
 * (Redis) is just a swap of the implementation; the public API stays the same.
 *
 * Usage:
 *   const { get, set, del, wrap } = createTtlCache({ ttlMs: 60_000 });
 *   const value = await wrap('key', () => fetchFromDb());
 *
 * `maxEntries` bounds the map for caches keyed by something unbounded (a user
 * id, say). Entries only expire when they are read, so without a cap a
 * per-user cache grows for the life of the process — every customer who ever
 * made one request stays resident. Omit it for the fixed-key caches
 * (settings, areas) where the key space is inherently small.
 */
function createTtlCache({ ttlMs, maxEntries = 0 } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('createTtlCache requires a positive ttlMs');
  }
  const store = new Map();

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > ttlMs) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value) {
    // Re-insert so Map iteration order is insertion order, which makes the
    // eviction below FIFO rather than "whichever key happened to be first".
    if (store.has(key)) store.delete(key);
    store.set(key, { value, at: Date.now() });
    if (maxEntries > 0) {
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
    }
  }

  function del(key) {
    if (key === undefined) {
      store.clear();
    } else {
      store.delete(key);
    }
  }

  /**
   * Cache-aside helper. Returns the cached value if fresh, otherwise calls
   * the loader, caches the result, and returns it. Rejected promises are
   * NOT cached (so a transient DB error doesn't poison the cache).
   */
  async function wrap(key, loader) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    const fresh = await loader();
    set(key, fresh);
    return fresh;
  }

  return { get, set, del, wrap };
}

module.exports = { createTtlCache };
