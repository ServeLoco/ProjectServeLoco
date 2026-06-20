const { pool } = require('../db/mysql');
const { emitToAdmins } = require('../realtime/socket');

const TYPES = {
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  NEW_ORDER: 'new_order',
  NEW_CUSTOMER: 'new_customer',
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

module.exports = {
  TYPES,
  createAdminNotification,
  getUnreadCount,
  broadcastUnreadCount,
};
