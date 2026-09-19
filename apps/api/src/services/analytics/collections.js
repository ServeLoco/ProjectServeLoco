// Analytics MongoDB collections + indexes.
// All analytics data lives in MongoDB (already connected); MySQL is untouched.
// TTL indexes auto-expire docs so the DB can never grow unbounded.
//
// ensureAnalyticsIndexes is called once at startup from db/index.js AFTER Mongo
// connect succeeds; the caller wraps it in try/catch — index failure logs an
// error but must not crash startup (Rule 7).

const logger = require('../../utils/logger');

const SESSIONS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2592000
const EVENTS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2592000
const DAILY_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year = 31536000

// Drops an index by name if it exists. MongoDB's dropIndex throws when the
// index is already gone (e.g. a second migrate run) — swallow only that
// specific "index not found" case (code 27 / message match) so a genuine
// failure still surfaces.
const dropIndexIfExists = async (collection, indexName) => {
  try {
    await collection.dropIndex(indexName);
  } catch (error) {
    if (error && (error.codeName === 'IndexNotFound' || error.code === 27)) return;
    throw error;
  }
};

/**
 * Create a TTL index, or fix the one that is already there.
 *
 * Creating a TTL index is not the same as having one. If `<field>_1` already
 * exists with a different `expireAfterSeconds` — or with none at all, which is
 * exactly what an index created before the TTL was introduced looks like —
 * `createIndex` rejects with IndexOptionsConflict instead of changing it. The
 * TTL actually in force stays whatever was there first, `db/index.js` only
 * logs the failure, and the collection quietly never expires anything. Nothing
 * about the code reads wrong at that point, which is why it needs handling
 * rather than trust: `collMod` is the only way to change an existing TTL.
 */
const ensureTtlIndex = async (db, collectionName, field, seconds) => {
  const collection = db.collection(collectionName);
  try {
    await collection.createIndex({ [field]: 1 }, { expireAfterSeconds: seconds });
  } catch (error) {
    const conflict = error && (error.codeName === 'IndexOptionsConflict' || error.code === 85);
    if (!conflict) throw error;
    await db.command({
      collMod: collectionName,
      index: { keyPattern: { [field]: 1 }, expireAfterSeconds: seconds },
    });
  }
};

/**
 * Read the TTL back off the server and report what is actually in force.
 *
 * The point of this is that "we called createIndex" and "documents expire" are
 * different claims, and only the second one matters. Returns the effective
 * seconds, or null when the collection has no TTL at all.
 */
const readEffectiveTtl = async (db, collectionName, field) => {
  const indexes = await db.collection(collectionName).indexes();
  const ttl = indexes.find(
    (ix) => ix.expireAfterSeconds !== undefined && ix.key && ix.key[field] === 1
  );
  return ttl ? ttl.expireAfterSeconds : null;
};

/**
 * Area 1 is the only area that has ever existed (§6.6 forbids a second area
 * until this sweep is complete), so every pre-existing analytics_daily doc
 * genuinely IS Area 1 data — this is a real backfill, not a fudge (§9.5).
 * Must run BEFORE the new { areaId: 1, date: 1 } unique index is created:
 * Mongo can't build a unique index over a field that doesn't exist yet on
 * old docs. Cheap (~365 docs/year), no batching needed.
 */
const backfillDailyAreaId = async (db) => {
  const daily = db.collection('analytics_daily');
  await daily.updateMany({ areaId: { $exists: false } }, { $set: { areaId: 1 } });
};

/**
 * Create all indexes for the three analytics collections exactly as specced.
 * @param {import('mongodb').Db} db
 */
const ensureAnalyticsIndexes = async (db) => {
  // TTLs go first, before any other index work. Expiry is the only thing
  // keeping this database bounded, and it must not be the step that gets
  // skipped because an unrelated index further down threw.
  await ensureTtlIndex(db, 'analytics_sessions', 'createdAt', SESSIONS_TTL_SECONDS);
  await ensureTtlIndex(db, 'analytics_events', 'createdAt', EVENTS_TTL_SECONDS);
  // MUST stay single-field on createdAt — a compound TTL index silently stops
  // expiry and the collection grows unbounded (§9.5).
  await ensureTtlIndex(db, 'analytics_daily', 'createdAt', DAILY_TTL_SECONDS);

  const sessions = db.collection('analytics_sessions');
  await sessions.createIndex({ userId: 1, createdAt: -1 });
  await sessions.createIndex({ areaId: 1, createdAt: -1 });

  const events = db.collection('analytics_events');
  await events.createIndex({ userId: 1, createdAt: -1 });
  await events.createIndex({ areaId: 1, createdAt: -1 });
  // Supersede the pre-area compound indexes with area-prefixed equivalents
  // (§3.3 leftmost-prefix rule) — drop the old ones so they don't sit around
  // as dead weight once nothing queries by { type } or { productId, type }
  // alone anymore.
  await dropIndexIfExists(events, 'type_1_createdAt_-1');
  await events.createIndex({ areaId: 1, type: 1, createdAt: -1 });
  await dropIndexIfExists(events, 'productId_1_type_1_createdAt_-1');
  await events.createIndex({ areaId: 1, productId: 1, type: 1, createdAt: -1 });

  const daily = db.collection('analytics_daily');
  await backfillDailyAreaId(db);
  await dropIndexIfExists(daily, 'date_1');
  await daily.createIndex({ areaId: 1, date: 1 }, { unique: true });
};

/**
 * Confirm the three collections really are expiring, and say so out loud.
 *
 * Runs after ensureAnalyticsIndexes at startup. A mismatch here is not fatal
 * — the API serves fine without expiry — but it is the difference between a
 * bounded database and one that grows forever, so it is logged as an error
 * with the numbers rather than left to be discovered from a disk alert.
 */
const verifyAnalyticsTtls = async (db, log = logger) => {
  const expected = [
    ['analytics_sessions', SESSIONS_TTL_SECONDS],
    ['analytics_events', EVENTS_TTL_SECONDS],
    ['analytics_daily', DAILY_TTL_SECONDS],
  ];
  const results = [];
  for (const [name, seconds] of expected) {
    const actual = await readEffectiveTtl(db, name, 'createdAt');
    results.push({ collection: name, expected: seconds, actual });
    if (actual === null) {
      log.error(`[analytics] ${name} has NO TTL index — it will grow without bound`);
    } else if (actual !== seconds) {
      log.error(
        `[analytics] ${name} expires after ${actual}s, expected ${seconds}s`
      );
    } else {
      log.info(`[analytics] ${name} expires after ${Math.round(seconds / 86400)} days`);
    }
  }
  return results;
};

module.exports = {
  ensureAnalyticsIndexes,
  verifyAnalyticsTtls,
  readEffectiveTtl,
  backfillDailyAreaId,
  SESSIONS_TTL_SECONDS,
  EVENTS_TTL_SECONDS,
  DAILY_TTL_SECONDS,
};
