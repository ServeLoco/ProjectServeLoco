// Analytics MongoDB collections + indexes.
// All analytics data lives in MongoDB (already connected); MySQL is untouched.
// TTL indexes auto-expire docs so the DB can never grow unbounded.
//
// ensureAnalyticsIndexes is called once at startup from db/index.js AFTER Mongo
// connect succeeds; the caller wraps it in try/catch — index failure logs an
// error but must not crash startup (Rule 7).

const SESSIONS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2592000
const EVENTS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2592000
const DAILY_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year = 31536000

/**
 * Create all indexes for the three analytics collections exactly as specced.
 * @param {import('mongodb').Db} db
 */
const ensureAnalyticsIndexes = async (db) => {
  const sessions = db.collection('analytics_sessions');
  await sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: SESSIONS_TTL_SECONDS });
  await sessions.createIndex({ userId: 1, createdAt: -1 });

  const events = db.collection('analytics_events');
  await events.createIndex({ createdAt: 1 }, { expireAfterSeconds: EVENTS_TTL_SECONDS });
  await events.createIndex({ userId: 1, createdAt: -1 });
  await events.createIndex({ type: 1, createdAt: -1 });
  await events.createIndex({ productId: 1, type: 1, createdAt: -1 });

  const daily = db.collection('analytics_daily');
  await daily.createIndex({ date: 1 }, { unique: true });
  await daily.createIndex({ createdAt: 1 }, { expireAfterSeconds: DAILY_TTL_SECONDS });
};

module.exports = {
  ensureAnalyticsIndexes,
  SESSIONS_TTL_SECONDS,
  EVENTS_TTL_SECONDS,
  DAILY_TTL_SECONDS,
};
