const { pool } = require('../db/mysql');
const { emitToAdmins, emitToPlatformAdmins } = require('../realtime/socket');
const { sendPushToMany } = require('./expoPush');
const { listAreas } = require('./areaScope');
const logger = require('./logger');

const TYPES = {
  NEW_ORDER: 'new_order',
  NEW_CUSTOMER: 'new_customer',
  SHOP_REJECTED: 'shop_rejected',
  SHOP_NOT_RESPONDING: 'shop_not_responding',
  // Fired when a shop's items were auto-rejected after SHOP_RESPONSE_TIMEOUT_MS
  // of silence AND the order is still alive afterward (another shop on the
  // same order already confirmed, or is still pending) — i.e. the case
  // maybeAutoCancelOrderWhenAllShopsRejected does NOT resolve on its own,
  // so an admin has to step in (resend to shop / cancel manually).
  SHOP_TIMEOUT_PARTIAL: 'shop_timeout_partial',
  ORDER_AUTO_CANCELLED: 'order_auto_cancelled',
  RIDER_ASSIGNMENT_FAILED: 'rider_assignment_failed',
  RIDER_ZERO_AVAILABLE: 'rider_zero_available',
  ORDER_CANCELLED_NO_RIDER: 'order_cancelled_no_rider',
  // Fired when replaceOrderItem's swap drops the order's subtotal below an
  // already-applied coupon's min_order_amount — the discount stays frozen
  // (no auto-refund/reconciliation automation in this codebase, same
  // reasoning as replaceOrderItem's own no-discount-recompute rule), so an
  // admin has to decide: cancel, manually adjust, or contact the customer.
  COUPON_TERMS_VIOLATED: 'coupon_terms_violated',
};

// Reusable persistence for callers that must commit notification + business
// state atomically. Errors propagate so their transaction can roll back.
const insertAdminNotification = async (queryable, { type, title, body, relatedUrl = null, relatedId = null, areaId }) => {
  const [result] = await queryable.query(
    `INSERT IGNORE INTO admin_notifications (area_id, type, title, body, related_url, related_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [areaId, type, title, body, relatedUrl, relatedId]
  );
  if (result.affectedRows === 0) return null;
  const [rows] = await queryable.query(
    `SELECT id, area_id, type, title, body, related_url, related_id, read_at, created_at
       FROM admin_notifications
      WHERE id = ?`,
    [result.insertId]
  );
  if (!rows[0]) throw new Error('Inserted admin notification could not be read');
  return rows[0];
};

// Publish only AFTER the caller's transaction commits. orderId may differ
// from the dedupe key (shop alerts identify a specific shop/request cycle).
const publishAdminNotification = (notification, { orderId = notification.related_id } = {}) => {
  const { area_id: areaId, title, body, type } = notification;
  if (areaId === null) {
    emitToPlatformAdmins('admin.notification.created', notification);
  } else {
    emitToAdmins(areaId, 'admin.notification.created', notification);
  }
  broadcastUnreadCount(areaId);
  notifyMobileAdminsPush({ title, body, type, relatedId: orderId, areaId })
    .catch((err) => logger.error('[adminNotifications] push failed:', err.message));
};

/**
 * Inserts an admin notification and pushes it live to every connected
 * admin via Socket.IO. Failures are logged but never throw — admin inbox
 * writes are best-effort and must not break the caller (e.g. a customer
 * checkout).
 *
 * areaId must be passed explicitly — never guessed here. Every caller with a
 * natural signal has one on hand (an order's own area_id, a shop-owner
 * action's shop area, etc.).
 *
 * `null` is a deliberate, meaningful value: a PLATFORM-level event that
 * belongs to no area. The only such caller today is authController's
 * new-signup notification, which fires before any pin exists — and there is
 * no default area to borrow, because every area is an equal tenant with its
 * own team. A NULL row shows up in the admin inbox's "All areas" view (which
 * runs with no area clause) and never in a single area's (which filters
 * `area_id = ?`, and a NULL never matches). Its realtime/push fan-out is
 * routed accordingly below.
 *
 * Note: MySQL treats NULLs as distinct in a unique index, so the
 * uniq_admin_inbox_area_event dedupe does not apply to platform rows. Fine
 * for new-signup (one per user id, behind an isNewUser branch); anything
 * higher-volume added later needs its own guard.
 */
const createAdminNotification = async (data) => {
  try {
    const notification = await insertAdminNotification(pool, data);
    if (notification) publishAdminNotification(notification);
    return notification;
  } catch (e) {
    logger.error('[adminNotifications] create failed:', e.message);
    return null;
  }
};

/**
 * areaId: a number scopes to one area; 'all' or omitted counts every area
 * (the pre-TASK-16 behavior, still used by broadcastUnreadCount's own
 * un-awaited fire-and-forget push since emitToAdmins isn't per-area yet).
 */
const getUnreadCount = async (areaId) => {
  try {
    const scoped = areaId !== undefined && areaId !== 'all';
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS n FROM admin_notifications WHERE read_at IS NULL${scoped ? ' AND area_id = ?' : ''}`,
      scoped ? [areaId] : []
    );
    return Number(rows[0].n) || 0;
  } catch (e) {
    logger.error('[adminNotifications] unread count failed:', e.message);
    return 0;
  }
};

// areaId 'all' (a super admin bulk read/dismiss) has no single room to
// target — each area's own admin room needs its own area-scoped count, not
// one global number broadcast everywhere, so fan out one emit per area.
const broadcastUnreadCount = async (areaId) => {
  // Platform-level: no area room owns this count, and a scoped count would
  // be `area_id = NULL`, which matches nothing and would push a badge of 0
  // to a room nobody is in. The super admin's "All areas" badge is the
  // unscoped total, so send that to the platform room.
  if (areaId === null) {
    emitToPlatformAdmins('admin.notification.unread_count', { count: await getUnreadCount('all') });
    return;
  }
  if (areaId === 'all') {
    const areas = await listAreas();
    await Promise.all(areas.map(async (area) => {
      const n = await getUnreadCount(area.id);
      emitToAdmins(area.id, 'admin.notification.unread_count', { count: n });
    }));
    return;
  }
  const n = await getUnreadCount(areaId);
  emitToAdmins(areaId, 'admin.notification.unread_count', { count: n });
};

/**
 * Fan out an Expo push to every active mobile admin with a linked, push-token
 * capable device, scoped to this notification's own area — a mobile admin
 * in area 2 has no reason to be paged about area 1's new order. Fire-and-
 * forget — never throws (mirrors createAdminNotification). `mobile_admins`
 * itself (CRUD/login) is otherwise untouched by this task — only this one
 * read, which lives in this task's own file, gained the area filter.
 */
const notifyMobileAdminsPush = async ({ title, body, type, relatedId, areaId }) => {
  try {
    // Every mobile_admins row is bound to one area, so a platform-level event
    // has no audience here. Returning early rather than querying `area_id =
    // NULL`, which matches nothing and would only look like a silent bug.
    if (areaId === null) return;
    const [rows] = await pool.query(
      'SELECT user_id FROM mobile_admins WHERE active = 1 AND user_id IS NOT NULL AND area_id = ?',
      [areaId]
    );
    const userIds = rows.map((r) => r.user_id);
    if (userIds.length === 0) return;
    await sendPushToMany(pool, userIds, {
      title,
      body,
      data: { type, orderId: relatedId },
    });
  } catch (e) {
    logger.error('[adminNotifications] mobile admin push fan-out failed:', e.message);
  }
};

module.exports = {
  TYPES,
  createAdminNotification,
  insertAdminNotification,
  publishAdminNotification,
  getUnreadCount,
  broadcastUnreadCount,
};
