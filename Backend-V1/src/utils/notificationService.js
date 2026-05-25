const { pool } = require('../db/mysql');

/**
 * Utility service to handle notifications and batches.
 */

const createNotification = async ({
  userId, title, body, type, sourceType = null, sourceId = null, eventKey = null,
  batchId = null, actionType = null, actionPayload = null, createdByAdminId = null,
  connection = pool
}) => {
  try {
    const [result] = await connection.query(`
      INSERT IGNORE INTO notifications (
        user_id, title, body, type, source_type, source_id, event_key,
        batch_id, action_type, action_payload, created_by_admin_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, title, body, type, sourceType, sourceId, eventKey,
      batchId, actionType, actionPayload ? JSON.stringify(actionPayload) : null, createdByAdminId
    ]);
    return result;
  } catch (error) {
    console.error('Error creating notification:', error);
    // Non-blocking, so we return null instead of throwing
    return null;
  }
};

const createManyNotifications = async (notifications, connection = pool) => {
  if (!notifications || notifications.length === 0) return null;
  try {
    const values = notifications.map(n => [
      n.userId, n.title, n.body, n.type, n.sourceType || null, n.sourceId || null,
      n.eventKey || null, n.batchId || null, n.actionType || null,
      n.actionPayload ? JSON.stringify(n.actionPayload) : null, n.createdByAdminId || null
    ]);

    const [result] = await connection.query(`
      INSERT IGNORE INTO notifications (
        user_id, title, body, type, source_type, source_id, event_key,
        batch_id, action_type, action_payload, created_by_admin_id
      ) VALUES ?
    `, [values]);
    return result;
  } catch (error) {
    console.error('Error creating many notifications:', error);
    return null;
  }
};

const createOrderNotification = async ({ userId, order, event, connection = pool }) => {
  let title = '';
  let body = '';
  let type = '';

  const orderNumber = order.order_number || order.orderNumber || order.id;
  const orderId = order.id;

  switch (event) {
    case 'order_placed':
      title = 'Order placed';
      body = `Your order #${orderNumber} has been placed successfully.`;
      type = 'order';
      break;
    case 'status_preparing':
      title = 'Order accepted';
      body = `Your order #${orderNumber} is being prepared.`;
      type = 'info';
      break;
    case 'status_out_for_delivery':
      title = 'Out for delivery';
      body = `Your order #${orderNumber} is on the way.`;
      type = 'warning';
      break;
    case 'status_delivered':
      title = 'Order delivered';
      body = `Your order #${orderNumber} has been delivered.`;
      type = 'success';
      break;
    case 'status_cancelled':
      title = 'Order cancelled';
      body = `Your order #${orderNumber} was cancelled.`;
      type = 'warning';
      break;
    case 'payment_paid':
      title = 'Payment received';
      body = `Payment for order #${orderNumber} has been marked paid.`;
      type = 'success';
      break;
    case 'payment_failed':
      title = 'Payment failed';
      body = `Payment for order #${orderNumber} failed. Please contact support.`;
      type = 'warning';
      break;
    case 'payment_refunded':
      title = 'Payment refunded';
      body = `Payment for order #${orderNumber} has been refunded.`;
      type = 'info';
      break;
    default:
      return null;
  }

  return createNotification({
    userId,
    title,
    body,
    type,
    sourceType: 'order',
    sourceId: orderId,
    eventKey: event,
    actionType: 'open_order',
    actionPayload: { orderId },
    connection
  });
};

const createNotificationBatch = async ({
  title, body, type, target, recipientCount, createdByAdminId, connection = pool
}) => {
  try {
    const [result] = await connection.query(`
      INSERT INTO notification_batches (
        title, body, type, target, recipient_count, created_by_admin_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [title, body, type, target, recipientCount, createdByAdminId]);
    return result;
  } catch (error) {
    console.error('Error creating notification batch:', error);
    throw error;
  }
};

const createBroadcastNotification = async ({
  title, body, type, createdByAdminId, targetUserIds, targetName, connection = pool
}) => {
  if (!targetUserIds || targetUserIds.length === 0) return null;

  try {
    const batchResult = await createNotificationBatch({
      title, body, type, target: targetName, recipientCount: targetUserIds.length, createdByAdminId, connection
    });
    const batchId = batchResult.insertId;

    // chunking by 500
    const chunkSize = 500;
    for (let i = 0; i < targetUserIds.length; i += chunkSize) {
      const chunk = targetUserIds.slice(i, i + chunkSize);
      const notifications = chunk.map(userId => ({
        userId, title, body, type, sourceType: 'broadcast', batchId, createdByAdminId
      }));
      await createManyNotifications(notifications, connection);
    }
    return { batchId, count: targetUserIds.length };
  } catch (error) {
    console.error('Error creating broadcast notification:', error);
    return null;
  }
};

const getUnreadCount = async (userId) => {
  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL AND deleted_at IS NULL',
    [userId]
  );
  return rows[0].count;
};

const markAllRead = async (userId) => {
  const [result] = await pool.query(
    'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL AND deleted_at IS NULL',
    [userId]
  );
  return result;
};

const softDeleteNotification = async (userId, notificationId) => {
  const [result] = await pool.query(
    'UPDATE notifications SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [notificationId, userId]
  );
  return result;
};

module.exports = {
  createNotification,
  createManyNotifications,
  createOrderNotification,
  createNotificationBatch,
  createBroadcastNotification,
  getUnreadCount,
  markAllRead,
  softDeleteNotification
};
