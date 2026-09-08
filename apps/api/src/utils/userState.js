/**
 * One cached read of the two `users` columns every authenticated request
 * needs: `blocked` (requireCustomer's gate) and `last_area_id` (the no-pin
 * area fallback in resolveCustomerArea, cartController and the socket join).
 *
 * Why this exists: MySQL is in a different region from the API (~94ms per
 * query — see riders.js/orderController.js). Those two columns were being
 * fetched by two separate, uncached, SEQUENTIAL queries on the same row on
 * every single authenticated request, so ~190ms of every response was spent
 * re-reading one user row that changes almost never.
 *
 * Staleness contract — read this before raising the TTL:
 *  - `blocked` is authorization, so it is deliberately NOT the last word
 *    anywhere it matters. orderController.createOrder re-reads it uncached
 *    inside its own transaction, which is the path where a stale `false`
 *    would actually cost money. The middleware gate is a fast rejection, not
 *    the security boundary.
 *  - Both writers bust explicitly: adminController's block/unblock, and
 *    createOrder's users.last_area_id write. So within one process the cache
 *    is not just fresh-ish, it is correct.
 *  - Across MULTIPLE API instances a bust only reaches the instance that
 *    served the write; the others carry a stale row for up to USER_STATE_TTL_MS.
 *    That is the reason this TTL is 30s and not 5 minutes.
 */
const { pool } = require('../db/mysql');
const { createTtlCache } = require('./ttlCache');

const USER_STATE_TTL_MS = 30_000;
// Bounded: the key space is "every customer who made a request", which is
// unbounded over a process's lifetime. 5k rows of {blocked, last_area_id} is
// trivial memory and comfortably covers concurrent actives.
const MAX_CACHED_USERS = 5000;

const userStateCache = createTtlCache({ ttlMs: USER_STATE_TTL_MS, maxEntries: MAX_CACHED_USERS });

/**
 * @returns {Promise<{blocked: boolean, lastAreaId: number|null}|null>}
 *   null when the user row does not exist (deleted account, forged token).
 *   Throws on a DB failure — callers must treat that as a 500, never as
 *   "user not found" (see requireCustomer's own comment).
 */
const getUserState = async (userId) => {
  return userStateCache.wrap(String(userId), async () => {
    const [rows] = await pool.query('SELECT blocked, last_area_id FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return null;
    return {
      blocked: Boolean(rows[0].blocked),
      lastAreaId: rows[0].last_area_id != null ? Number(rows[0].last_area_id) : null,
    };
  });
};

/** Call after ANY write to users.blocked or users.last_area_id. */
const bustUserState = (userId) => userStateCache.del(userId === undefined ? undefined : String(userId));

module.exports = { getUserState, bustUserState, USER_STATE_TTL_MS };
