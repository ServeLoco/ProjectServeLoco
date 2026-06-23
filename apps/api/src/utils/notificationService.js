const { pool } = require('../db/mysql');
const expoPush = require('./expoPush');

/**
 * Utility service to handle notifications and batches.
 */

const firstQueryResult = (queryResult) => (
  Array.isArray(queryResult) ? queryResult[0] : queryResult
);

const createNotification = async ({
  userId, title, body, type, sourceType = null, sourceId = null, eventKey = null,
  batchId = null, actionType = null, actionPayload = null, createdByAdminId = null,
  connection = pool
}) => {
  try {
    const queryResult = await connection.query(`
      INSERT IGNORE INTO notifications (
        user_id, title, body, type, source_type, source_id, event_key,
        batch_id, action_type, action_payload, created_by_admin_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, title, body, type, sourceType, sourceId, eventKey,
      batchId, actionType, actionPayload ? JSON.stringify(actionPayload) : null, createdByAdminId
    ]);

    // Fire real push notification so it arrives even when the app is closed.
    // Always uses pool (never the transaction connection) so the token lookup
    // doesn't block or get rolled back with the outer transaction.
    // data.orderId lets the client navigate directly to the order when the user
    // taps the notification from a killed app. categoryId wires up the
    // "View Order" action button registered on the client.
    const pushData = { type: type || 'info' };
    if (sourceType === 'order' && sourceId) pushData.orderId = String(sourceId);

    expoPush.sendPushToUser(pool, userId, {
      title,
      body,
      data: pushData,
      ...(sourceType === 'order' ? { categoryId: 'order_update' } : {}),
    }).catch(() => {});

    return firstQueryResult(queryResult);
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

    const queryResult = await connection.query(`
      INSERT IGNORE INTO notifications (
        user_id, title, body, type, source_type, source_id, event_key,
        batch_id, action_type, action_payload, created_by_admin_id
      ) VALUES ?
    `, [values]);
    return firstQueryResult(queryResult);
  } catch (error) {
    console.error('Error creating many notifications:', error);
    return null;
  }
};

const createOrderNotification = async ({ userId, order, event, connection = pool }) => {
  const orderNumber = order.order_number || order.orderNumber || order.id;
  const orderId = order.id;

  // Try to get template from database (gracefully handle if table doesn't exist)
  let title = '';
  let body = '';
  let type = '';

  try {
    const [templates] = await connection.query(
      'SELECT title, body FROM notification_templates WHERE event_key = ? AND enabled = 1 LIMIT 1',
      [event]
    );

    if (templates && templates.length > 0) {
      title = templates[0].title;
      body = templates[0].body;
    }
  } catch (error) {
    // Table might not exist in test environment or old databases - that's okay
    // We'll use fallback messages
  }

  // Fallback to hardcoded messages if template not found
  if (!title || !body) {
    switch (event) {
      case 'order_placed':
        title = '🎉 Order Confirmed!';
        body = 'Your order has been placed successfully. We\'ll notify you once it\'s accepted.';
        type = 'order';
        break;
      case 'status_accepted':
        title = '✅ Order Accepted!';
        body = 'Great news! Your order has been accepted and will be prepared shortly.';
        type = 'info';
        break;
      case 'status_preparing':
        title = '👨‍🍳 Preparing Your Order';
        body = 'Your delicious order is being prepared with care. Hang tight!';
        type = 'info';
        break;
      case 'status_out_for_delivery':
        title = '🚚 On The Way!';
        body = 'Your order is out for delivery. It will reach you soon!';
        type = 'warning';
        break;
      case 'status_delivered':
        title = '🎊 Delivered!';
        body = 'Your order has been delivered. Enjoy your meal!';
        type = 'success';
        break;
      case 'status_cancelled':
        title = '❌ Order Cancelled';
        body = 'Your order was cancelled. Contact us if you need help.';
        type = 'warning';
        break;
      case 'payment_paid':
        title = '💰 Payment Received';
        body = 'Your payment has been confirmed. Thank you!';
        type = 'success';
        break;
      case 'payment_failed':
        title = '⚠️ Payment Issue';
        body = 'Payment failed. Please try again or contact support.';
        type = 'warning';
        break;
      case 'payment_refunded':
        title = '💸 Refund Processed';
        body = 'Your payment has been refunded successfully.';
        type = 'info';
        break;
      default:
        return null;
    }
  }

  // Determine type based on event if not set
  if (!type) {
    if (event.includes('delivered') || event.includes('paid')) {
      type = 'success';
    } else if (event.includes('cancelled') || event.includes('failed')) {
      type = 'warning';
    } else if (event === 'order_placed') {
      type = 'order';
    } else {
      type = 'info';
    }
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
    actionPayload: { orderId, orderNumber },
    connection
  });
};

const createNotificationBatch = async ({
  title, body, type, target, recipientCount, createdByAdminId, connection = pool
}) => {
  try {
    const queryResult = await connection.query(`
      INSERT INTO notification_batches (
        title, body, type, target, recipient_count, created_by_admin_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [title, body, type, target, recipientCount, createdByAdminId]);
    return firstQueryResult(queryResult);
  } catch (error) {
    console.error('Error creating notification batch:', error);
    throw error;
  }
};

const createBroadcastNotification = async ({
  title, body, type, createdByAdminId, targetUserIds, targetName, connection = pool
}) => {
  if (!targetUserIds || targetUserIds.length === 0) return null;

  const ownsConnection = connection === pool && typeof pool.getConnection === 'function';
  const tx = ownsConnection ? await pool.getConnection() : connection;

  try {
    if (ownsConnection) {
      await tx.beginTransaction();
    }

    const batchResult = await createNotificationBatch({
      title, body, type, target: targetName, recipientCount: targetUserIds.length, createdByAdminId, connection: tx
    });
    const batchId = batchResult.insertId;

    // chunking by 500
    const chunkSize = 500;
    for (let i = 0; i < targetUserIds.length; i += chunkSize) {
      const chunk = targetUserIds.slice(i, i + chunkSize);
      const notifications = chunk.map(userId => ({
        userId, title, body, type, sourceType: 'broadcast', batchId, createdByAdminId
      }));
      const insertResult = await createManyNotifications(notifications, tx);
      if (!insertResult) {
        throw new Error('Failed to create recipient notifications');
      }
    }
    if (ownsConnection) {
      await tx.commit();
    }

    // Batch push — fire after commit so tokens are read from a stable DB state.
    expoPush.sendPushToMany(pool, targetUserIds, { title, body }).catch(() => {});

    return { batchId, count: targetUserIds.length };
  } catch (error) {
    if (ownsConnection) {
      await tx.rollback();
    }
    console.error('Error creating broadcast notification:', error);
    return null;
  } finally {
    if (ownsConnection) {
      tx.release();
    }
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
