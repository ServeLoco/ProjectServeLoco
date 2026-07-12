const { pool } = require('../db/mysql');
const { emitToAdmins } = require('../realtime/socket');
const { sendPushToMany } = require('./expoPush');

const TYPES = {
  NEW_ORDER: 'new_order',
  NEW_CUSTOMER: 'new_customer',
  SHOP_REJECTED: 'shop_rejected',
  ORDER_AUTO_CANCELLED: 'order_auto_cancelled',
  RIDER_ASSIGNMENT_FAILED: 'rider_assignment_failed',
  RIDER_ZERO_AVAILABLE: 'rider_zero_available',
  ORDER_CANCELLED_NO_RIDER: 'order_cancelled_no_rider',
};

/**
 * Inserts an admin notification and pushes it live to every connected
 * admin via Socket.IO. Failures are logged but never throw — admin inbox
 * writes are best-effort and must not break the caller (e.g. a customer
 * checkout).
 */
const createAdminNotification = async ({ type, title, body, relatedUrl = null, relatedId = null }) => {
  try {
    // Skip rows that would collide with an existing un-acknowledged event for
    // the same business entity (e.g. duplicate signup/order retries).
    const [result] = await pool.query(
      `INSERT IGNORE INTO admin_notifications (type, title, body, related_url, related_id)
       VALUES (?, ?, ?, ?, ?)`,
      [type, title, body, relatedUrl, relatedId]
    );
    if (result.affectedRows === 0) {
      // Duplicate — don't emit a realtime event, the original is already
      // pending in the admin's inbox.
      return null;
    }
    const [rows] = await pool.query(
      `SELECT id, type, title, body, related_url, related_id, read_at, created_at
         FROM admin_notifications
        WHERE id = ?`,
      [result.insertId]
    );
    const notification = rows[0];
    if (notification) {
      emitToAdmins('admin.notification.created', notification);
      // Fire-and-forget updated badge count so all open admin tabs refresh.
      broadcastUnreadCount();
      // Background push to mobile admin phones (D4 — foreground gets the
      // socket event above; backgrounded/killed apps need a device push).
      // Only for new orders (ADMIN TASK 4); the INSERT IGNORE above already
      // means this only runs once per order even if callers double-fire.
      if (type === TYPES.NEW_ORDER) {
        await notifyMobileAdminsPush({ title, body, type, relatedId });
      }
    }
    return notification;
  } catch (e) {
    console.error('[adminNotifications] create failed:', e.message);
    return null;
  }
};

const getUnreadCount = async () => {
  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS n FROM admin_notifications WHERE read_at IS NULL'
    );
    return Number(rows[0].n) || 0;
  } catch (e) {
    console.error('[adminNotifications] unread count failed:', e.message);
    return 0;
  }
};

const broadcastUnreadCount = async () => {
  const n = await getUnreadCount();
  emitToAdmins('admin.notification.unread_count', { count: n });
};

/**
 * Fan out an Expo push to every active mobile admin with a linked, push-token
 * capable device. Fire-and-forget — never throws (mirrors createAdminNotification).
 */
const notifyMobileAdminsPush = async ({ title, body, type, relatedId }) => {
  try {
    const [rows] = await pool.query(
      'SELECT user_id FROM mobile_admins WHERE active = 1 AND user_id IS NOT NULL'
    );
    const userIds = rows.map((r) => r.user_id);
    if (userIds.length === 0) return;
    await sendPushToMany(pool, userIds, {
      title,
      body,
      data: { type, orderId: relatedId },
    });
  } catch (e) {
    console.error('[adminNotifications] mobile admin push fan-out failed:', e.message);
  }
};

module.exports = {
  TYPES,
  createAdminNotification,
  getUnreadCount,
  broadcastUnreadCount,
};
