const { pool } = require('../db/mysql');
const config = require('../config/env');
const adminInbox = require('../utils/adminNotifications');

// Lock in the same order as shop decisions: order first, then its items.
// Both the escalation marker and inbox row commit together. A failed write
// leaves the request eligible for retry, and another API instance waits for
// this transaction before deciding whether it still needs to notify.
async function escalatePendingShopOrder(orderId, shopId, shopName) {
  const connection = await pool.getConnection();
  let notification = null;
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order || !['Accepted', 'Preparing'].includes(order.status) || !order.accepted_at) {
      await connection.rollback();
      return null;
    }
    const [claim] = await connection.query(
      `UPDATE order_items SET shop_admin_alerted_at = NOW()
       WHERE order_id = ? AND shop_id = ?
         AND shop_confirmed_at IS NULL AND shop_rejected_at IS NULL
         AND shop_admin_alerted_at IS NULL
         AND COALESCE(shop_requested_at, ?) <= NOW() - INTERVAL ? SECOND
         AND COALESCE(shop_requested_at, ?) > NOW() - INTERVAL ? SECOND`,
      [orderId, shopId, order.accepted_at, Math.ceil(config.SHOP_ADMIN_ALERT_MS / 1000),
        order.accepted_at, Math.ceil(config.SHOP_RESPONSE_TIMEOUT_MS / 1000)]
    );
    if (!claim.affectedRows) {
      await connection.rollback();
      return null;
    }
    // Derive the request identity in MySQL, avoiding driver/timezone changes.
    const [[request]] = await connection.query(
      `SELECT DATE_FORMAT(COALESCE(shop_requested_at, ?), '%Y%m%d%H%i%s') AS alert_cycle
       FROM order_items WHERE order_id = ? AND shop_id = ? LIMIT 1`,
      [order.accepted_at, orderId, shopId]
    );
    const number = order.order_number || order.id;
    const minutes = Math.ceil(config.SHOP_ADMIN_ALERT_MS / 60000);
    notification = await adminInbox.insertAdminNotification(connection, {
      type: adminInbox.TYPES.SHOP_NOT_RESPONDING,
      title: `${shopName || 'A shop'} has not responded to order #${number}`,
      body: `${shopName || 'A shop'} has not accepted or rejected order #${number} after ${minutes} minutes. The order alert is still being repeated. Contact the shop and ask them to accept or reject it.`,
      relatedUrl: `/orders?id=${order.id}`,
      relatedId: `${order.id}-${shopId}-${request.alert_cycle}`,
      areaId: order.area_id,
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (notification) adminInbox.publishAdminNotification(notification, { orderId: String(orderId) });
  return notification;
}

module.exports = { escalatePendingShopOrder };
