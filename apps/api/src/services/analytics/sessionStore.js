// Analytics session store — one doc per app session in MongoDB.
// All writes are fire-and-forget per Rule 7: a Mongo outage never throws into
// the request path. openSession returns null on failure; closeSession swallows.

const { getDb } = require('../../db/mongodb');

/**
 * Insert a new session doc and return its _id (null if Mongo is unavailable).
 * areaId is passed straight through by the caller (socket.js); this module
 * stays a thin Mongo-only wrapper with no MySQL dependency of its own. It is
 * null at connect — no pin exists at the socket layer, and there is no
 * default area to guess with — and is filled in by setSessionArea below once
 * the app resolves its live pin. A session that never resolves one stays
 * null, which the admin analytics read as "All areas only".
 * @param {{userId:number, platform:string, appVersion:string, areaId?:number}} meta
 * @returns {Promise<string|null>}
 */
const openSession = async ({ userId, platform, appVersion, areaId }) => {
  try {
    const now = new Date();
    const res = await getDb().collection('analytics_sessions').insertOne({
      userId,
      areaId,
      platform: platform || null,
      appVersion: appVersion || null,
      connectedAt: now,
      disconnectedAt: null,
      durationSec: 0,
      screens: {},
      createdAt: now,
    });
    return res.insertedId || null;
  } catch (error) {
    console.error('[analytics] openSession failed:', error.message);
    return null;
  }
};

/**
 * Stamp disconnect time, screen counts, and duration on a session doc.
 * No-op without a sessionId; never throws (fire-and-forget).
 * @param {string|null} sessionId
 * @param {Record<string, number>} screens  e.g. { Home: 3, Cart: 1 }
 * @param {Date} [connectedAt]  optional anchor to compute duration; if omitted
 *   the doc's existing connectedAt is left untouched and durationSec is set
 *   from now vs the Map-tracked connectedAt by the caller.
 */
const closeSession = async (sessionId, screens, connectedAt) => {
  if (!sessionId) return;
  try {
    const now = new Date();
    const durationSec = connectedAt
      ? Math.max(0, Math.round((now - new Date(connectedAt)) / 1000))
      : 0;
    await getDb().collection('analytics_sessions').updateOne(
      { _id: sessionId },
      [{
        $set: {
          disconnectedAt: now,
          durationSec,
          screens: screens || {},
        },
      }]
    );
  } catch (error) {
    console.error('[analytics] closeSession failed:', error.message);
  }
};

/**
 * Attach the area a session actually turned out to be in, once the app's own
 * live pin resolves (socket 'area:changed'). Sessions used to be stamped at
 * connect from users.last_area_id → default area, which is a guess: it filed
 * a customer standing in area 2 under area 1 because that is where they last
 * ordered, inflating that team's analytics with another team's customers.
 * Best-effort, same as everything else in this module.
 */
const setSessionArea = async (sessionId, areaId) => {
  if (!sessionId || !areaId) return;
  try {
    await getDb().collection('analytics_sessions').updateOne(
      { _id: sessionId },
      { $set: { areaId } },
    );
  } catch (e) {
    console.error('[analytics] setSessionArea failed:', e.message);
  }
};

module.exports = { openSession, closeSession, setSessionArea };
