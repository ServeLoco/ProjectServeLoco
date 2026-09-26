/**
 * In-process micro-cache for hot public GETs (dashboard, categories,
 * delivery zones). Plain Map, FIFO eviction. No redis.
 *
 * Multi-area: every key MUST be shaped `<namespace>:<areaId>:<rest>` (or
 * bare `<namespace>:<areaId>` with no rest) so a mutation in one area can
 * never bust another area's cached response. set() validates this shape
 * outside production and throws on a malformed key — catching a missing
 * areaId at the call site that wrote it, not months later as a customer
 * seeing another area's dashboard. get() stays lenient: a malformed read
 * key just misses the cache rather than crashing a request.
 * bust(namespace, areaId) then clears exactly one area's slice;
 * bust(namespace) with no areaId is kept only for genuinely global
 * (non-area) cache entries — see plans/multi-area.md §3.4.
 */

const MAX_ENTRIES = 600;

/** @type {Map<string, { value: any, expiresAt: number }>} */
const store = new Map();

// Namespaces with one key per customer cart get a store (and cap) of their
// own, so a busy evening of carts can never evict the few hot dashboard /
// category entries every customer reads.
const OWN_STORE_CAPS = { suggest: 200 };
const ownStores = new Map(Object.keys(OWN_STORE_CAPS).map((namespace) => [namespace, new Map()]));

const namespaceOf = (key) => String(key).split(':', 1)[0];
const storeFor = (key) => ownStores.get(namespaceOf(key)) || store;
const capFor = (key) => OWN_STORE_CAPS[namespaceOf(key)] || MAX_ENTRIES;

const KEY_SHAPE = /^[^:]+:\d+(:.*)?$/;

function assertValidKey(key) {
  if (process.env.NODE_ENV === 'production') return;
  if (typeof key !== 'string' || !KEY_SHAPE.test(key)) {
    throw new Error(
      `microCache: key ${JSON.stringify(key)} is not shaped "<namespace>:<areaId>:<rest>" — ` +
      'every entry must be scoped to an area. See plans/multi-area.md §3.4.'
    );
  }
}

function get(key) {
  const target = storeFor(key);
  const entry = target.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    target.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  assertValidKey(key);
  const target = storeFor(key);
  const cap = capFor(key);
  if (target.has(key)) target.delete(key);
  target.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
  while (target.size > cap) {
    const oldest = target.keys().next().value;
    target.delete(oldest);
  }
}

/**
 * bust(namespace) — global prefix bust (plain startsWith), for genuinely
 * non-area-scoped data only.
 * bust(namespace, areaId) — clears exactly that area's slice. Matches the
 * bare `namespace:areaId` key and everything under `namespace:areaId:`,
 * guarded by the trailing colon so area 1 can never accidentally sweep
 * area 10's keys via a naive substring prefix match.
 */
function bust(namespace, areaId) {
  const target = ownStores.get(namespace) || store;
  if (areaId === undefined) {
    for (const key of [...target.keys()]) {
      if (key.startsWith(namespace)) target.delete(key);
    }
    return;
  }
  const exact = `${namespace}:${areaId}`;
  const prefix = `${exact}:`;
  for (const key of [...target.keys()]) {
    if (key === exact || key.startsWith(prefix)) target.delete(key);
  }
}

function clearAll() {
  store.clear();
  for (const own of ownStores.values()) own.clear();
}

module.exports = { get, set, bust, clearAll, MAX_ENTRIES };
