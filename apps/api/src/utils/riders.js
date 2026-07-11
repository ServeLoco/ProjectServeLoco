const { pool } = require('../db/mysql');
const config = require('../config/env');

// Soft presence window: a rider who toggled online but has not heartbeated
// within this many seconds is treated as offline for eligibility + delivery gate.
const RIDER_HEARTBEAT_TTL_SEC = config.RIDER_HEARTBEAT_TTL_SEC || 90;

// Calendar day for "least orders completed today" (D8 = Asia/Kolkata).
// Use fixed offset so MySQL does not require named timezone tables loaded.
const RIDER_TODAY_TZ = config.RIDER_TODAY_TZ || '+05:30';

const riderShape = (r) => {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    user_id: r.user_id,
    displayName: r.display_name,
    display_name: r.display_name,
    phone: r.phone || null,
    active: Boolean(r.active),
    isOnline: Boolean(r.is_online),
    is_online: Boolean(r.is_online),
    lastHeartbeatAt: r.last_heartbeat_at || null,
    last_heartbeat_at: r.last_heartbeat_at || null,
  };
};

/**
 * Returns the ACTIVE rider linked to this user, or null.
 * Mirrors getShopForUser — one rider per user by unique user_id.
 */
const getRiderForUser = async (userId) => {
  if (!userId) return null;
  const [rows] = await pool.query(
    `SELECT id, user_id, display_name, phone, active, is_online, last_heartbeat_at
     FROM riders
     WHERE user_id = ? AND active = 1
     LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return null;
  return riderShape(rows[0]);
};

/**
 * SQL fragment: heartbeat is fresh (within RIDER_HEARTBEAT_TTL_SEC).
 * Uses last_heartbeat_at; NULL heartbeat is never fresh.
 */
const heartbeatFreshSql = (alias = 'r') =>
  `${alias}.last_heartbeat_at IS NOT NULL AND ${alias}.last_heartbeat_at > (NOW() - INTERVAL ${Number(RIDER_HEARTBEAT_TTL_SEC)} SECOND)`;

/**
 * Count riders who are admin-active, toggled online, and heartbeat-fresh.
 * Busy-ness is ignored (plan §12 — delivery gate follows online state only).
 */
const countActiveRiders = async () => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM riders r
     WHERE r.active = 1
       AND r.is_online = 1
       AND ${heartbeatFreshSql('r')}`
  );
  return Number(rows[0]?.cnt) || 0;
};

/**
 * Eligible for a new offer: active, online, heartbeat fresh, no open
 * assignment, and not in excludeIds (already offered/rejected this order).
 */
const listEligibleRiders = async ({ excludeIds = [] } = {}) => {
  const exclude = (excludeIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const params = [];
  let excludeClause = '';
  if (exclude.length > 0) {
    excludeClause = `AND r.id NOT IN (${exclude.map(() => '?').join(',')})`;
    params.push(...exclude);
  }

  const [rows] = await pool.query(
    `SELECT r.id, r.user_id, r.display_name, r.phone, r.active, r.is_online, r.last_heartbeat_at
     FROM riders r
     WHERE r.active = 1
       AND r.is_online = 1
       AND ${heartbeatFreshSql('r')}
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.rider_id = r.id
           AND o.status NOT IN ('Delivered', 'Cancelled')
       )
       ${excludeClause}
     ORDER BY r.id ASC`,
    params
  );

  return rows.map(riderShape);
};

/**
 * Count Delivered orders completed by this rider on the calendar day in RIDER_TODAY_TZ.
 * Uses COALESCE(rider_assigned_at, updated_at) converted to that timezone for the day boundary.
 */
const countCompletedDeliveriesToday = async (riderId) => {
  if (!riderId) return 0;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM orders
     WHERE rider_id = ?
       AND status = 'Delivered'
       AND DATE(CONVERT_TZ(COALESCE(updated_at, created_at), @@session.time_zone, ?)) =
           DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', ?))`,
    [riderId, RIDER_TODAY_TZ, RIDER_TODAY_TZ]
  );
  return Number(rows[0]?.cnt) || 0;
};

/**
 * Pure selection: riders with least completedToday; ties broken by randomFn.
 * Each rider object may already include completedToday; if missing, treated as 0.
 * @param {Array<{id:number, completedToday?:number}>} riders
 * @param {{ random?: () => number }} opts - random() returns [0,1)
 */
const selectRiderByLeastOrders = (riders, opts = {}) => {
  const random = typeof opts.random === 'function' ? opts.random : Math.random;
  if (!riders || riders.length === 0) return null;
  if (riders.length === 1) return riders[0];

  let min = Infinity;
  for (const r of riders) {
    const c = Number(r.completedToday) || 0;
    if (c < min) min = c;
  }
  const candidates = riders.filter((r) => (Number(r.completedToday) || 0) === min);
  if (candidates.length === 1) return candidates[0];
  const idx = Math.floor(random() * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)];
};

/**
 * Attach completedToday to each eligible rider and pick by least orders.
 */
const selectEligibleRider = async (riders, opts = {}) => {
  if (!riders || riders.length === 0) return null;
  const withCounts = await Promise.all(
    riders.map(async (r) => ({
      ...r,
      completedToday: await countCompletedDeliveriesToday(r.id),
    }))
  );
  return selectRiderByLeastOrders(withCounts, opts);
};

/**
 * Auto-manage settings.delivery_available from online rider count (D12).
 * 0 active online riders → OFF; ≥1 → ON. Then re-sync shop_open via shops util.
 * Never throws.
 */
const syncDeliveryAvailabilityFromRiders = async () => {
  try {
    const activeCount = await countActiveRiders();
    const desired = activeCount > 0 ? 1 : 0;

    const [settingsRows] = await pool.query('SELECT delivery_available FROM settings LIMIT 1');
    if (settingsRows.length === 0) return { changed: false, activeCount, deliveryAvailable: Boolean(desired) };

    const current = settingsRows[0].delivery_available ? 1 : 0;
    let changed = false;

    if (current !== desired) {
      const [result] = await pool.query(
        'UPDATE settings SET delivery_available = ? WHERE delivery_available != ?',
        [desired, desired]
      );
      changed = result.affectedRows > 0;
    }

    if (changed) {
      try {
        const { bustSettingsCache } = require('../controllers/settingsController');
        bustSettingsCache();
      } catch (_) {
        // best-effort
      }

      try {
        const { emitToAllCustomers } = require('../realtime/socket');
        emitToAllCustomers('settings.delivery_available.updated', {
          deliveryAvailable: Boolean(desired),
          delivery_available: Boolean(desired),
        });
      } catch (_) {
        // best-effort
      }

      // Existing master-gate side effect: delivery off forces shop_open closed, etc.
      const { syncGlobalShopOpenState } = require('./shops');
      await syncGlobalShopOpenState();
    }

    return { changed, activeCount, deliveryAvailable: Boolean(desired) };
  } catch (e) {
    console.error('[riders] syncDeliveryAvailabilityFromRiders failed:', e.message);
    return { changed: false, activeCount: 0, deliveryAvailable: false, error: e.message };
  }
};

module.exports = {
  RIDER_HEARTBEAT_TTL_SEC,
  RIDER_TODAY_TZ,
  riderShape,
  getRiderForUser,
  countActiveRiders,
  listEligibleRiders,
  countCompletedDeliveriesToday,
  selectRiderByLeastOrders,
  selectEligibleRider,
  syncDeliveryAvailabilityFromRiders,
  heartbeatFreshSql,
};
