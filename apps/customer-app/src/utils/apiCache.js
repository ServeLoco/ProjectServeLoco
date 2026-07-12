/**
 * In-memory API response cache (SWR support).
 *
 * Key convention: "<domain>:<param>"
 *   e.g. "categories:fast_food", "products:<stableKey>", "product:42"
 *
 * Max 50 entries; oldest (insertion-order Map) are evicted first.
 * Do NOT persist product/price/availability data to disk.
 */

const MAX_ENTRIES = 50;

/** @type {Map<string, { data: any, ts: number }>} */
const store = new Map();

/**
 * @param {string} key
 * @returns {{ data: any, ageMs: number } | null}
 */
export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  return { data: entry.data, ageMs: Date.now() - entry.ts };
}

/**
 * @param {string} key
 * @param {any} data
 */
export function setCached(key, data) {
  // Re-insert so the entry becomes the newest (insertion-order eviction).
  if (store.has(key)) store.delete(key);
  store.set(key, { data, ts: Date.now() });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

/**
 * @param {string} key
 * @param {number} maxAgeMs
 * @returns {boolean}
 */
export function isFresh(key, maxAgeMs) {
  const entry = store.get(key);
  if (!entry) return false;
  return Date.now() - entry.ts < maxAgeMs;
}

/**
 * Delete all keys that start with the given prefix.
 * @param {string} keyPrefix
 */
export function invalidate(keyPrefix) {
  for (const key of [...store.keys()]) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}

export function clearAll() {
  store.clear();
}

/**
 * Serialize a params object with sorted keys for stable cache keys.
 * @param {Record<string, any>} obj
 * @returns {string}
 */
export function stableKey(obj) {
  if (obj == null || typeof obj !== 'object') return String(obj);
  const keys = Object.keys(obj).sort();
  const normalized = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    normalized[k] = v;
  }
  return JSON.stringify(normalized);
}
