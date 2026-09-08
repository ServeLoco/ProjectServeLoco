/**
 * Cached reads of the two things every admin request/socket-connect
 * re-checks against the live DB, not just the JWT's claims — the same
 * "is this session still good, right now" gap `getUserState` closed for
 * customers (utils/userState.js), applied to authMiddleware.js's requireAdmin
 * and socket.js's authenticateSocket:
 *
 *   1. admin_auth_state.revoked_before — the shared, platform-wide kill
 *      switch ("revoke all sessions").
 *   2. admins.role / area_id / active for the specific admin on the token —
 *      catches a deactivation or a role/area reassignment mid-session.
 *
 * Why this exists: MySQL is in a different region from the API (~94ms/query
 * — see riders.js/orderController.js). Both checks were uncached, sequential
 * queries on every single admin request, so ~190ms of every admin response
 * (and every socket connect/reconnect) was spent re-reading rows that change
 * almost never.
 *
 * Staleness contract — read this before raising ADMIN_AUTH_TTL_MS:
 *  - Both are authorization-bearing (a revoked/deactivated/reassigned admin
 *    must stop working promptly), so the TTL is deliberately short — a third
 *    of getUserState's 30s — trading less of the latency win for a tighter
 *    bound on "how long can a revoked admin keep going".
 *  - Both writers bust explicitly: adminController's revokeSessions (the
 *    global kill switch) and areaController's updateAdmin (a specific
 *    admin's role/area/active). So within one process the cache is not just
 *    fresh-ish, it is correct.
 *  - Across MULTIPLE API instances a bust only reaches the instance that
 *    served the write; the others carry a stale value for up to
 *    ADMIN_AUTH_TTL_MS. Same tradeoff getUserState already accepted.
 */
const { pool } = require('../db/mysql');
const { createTtlCache } = require('./ttlCache');

const ADMIN_AUTH_TTL_MS = 10_000;
// Bounded: the key space is "every admin who made a request", small in
// practice (this is an admin panel, not the customer app) but not worth
// leaving unbounded across a long-lived process.
const MAX_CACHED_ADMINS = 2000;

const REVOKED_BEFORE_KEY = 'revokedBefore';
const revokedBeforeCache = createTtlCache({ ttlMs: ADMIN_AUTH_TTL_MS });
const liveAdminRowCache = createTtlCache({ ttlMs: ADMIN_AUTH_TTL_MS, maxEntries: MAX_CACHED_ADMINS });

/**
 * @returns {Promise<Date|string|null>} the admin_auth_state.revoked_before
 *   value (or null if never set / no row yet).
 */
const getRevokedBefore = async () => {
  return revokedBeforeCache.wrap(REVOKED_BEFORE_KEY, async () => {
    const [rows] = await pool.query('SELECT revoked_before FROM admin_auth_state WHERE id = 1');
    return rows[0]?.revoked_before ?? null;
  });
};

/**
 * @returns {Promise<{role: string, area_id: number|null, active: number}|null>}
 *   null when adminId does not exist (deleted admin, forged token).
 */
const getLiveAdminRow = async (adminId) => {
  return liveAdminRowCache.wrap(String(adminId), async () => {
    const [rows] = await pool.query('SELECT role, area_id, active FROM admins WHERE id = ?', [adminId]);
    return rows[0] || null;
  });
};

/** Call after UPDATE admin_auth_state SET revoked_before = ... (revokeSessions). */
const bustRevokedBefore = () => revokedBeforeCache.del(REVOKED_BEFORE_KEY);

/**
 * Call after UPDATE admins SET ... WHERE id = <adminId> (updateAdmin) — role,
 * area_id, or active changed. Omit adminId to clear every cached admin
 * (test-only; there is no legitimate production call site for a full clear).
 */
const bustLiveAdminRow = (adminId) => liveAdminRowCache.del(adminId === undefined ? undefined : String(adminId));

// Test-only: reset both caches so tests don't leak state into each other via
// the 10s TTL — mirrors areaScope.js's _resetCachesForTests.
const _resetCachesForTests = () => {
  revokedBeforeCache.del();
  liveAdminRowCache.del();
};

module.exports = {
  getRevokedBefore,
  getLiveAdminRow,
  bustRevokedBefore,
  bustLiveAdminRow,
  ADMIN_AUTH_TTL_MS,
  _resetCachesForTests,
};
