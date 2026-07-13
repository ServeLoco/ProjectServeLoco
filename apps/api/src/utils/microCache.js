/**
 * In-process micro-cache for hot public GETs (dashboard, categories).
 * Plain Map, max 100 entries, FIFO eviction. No redis.
 */

const MAX_ENTRIES = 100;

/** @type {Map<string, { value: any, expiresAt: number }>} */
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

function bust(prefix) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function clearAll() {
  store.clear();
}

module.exports = { get, set, bust, clearAll };
