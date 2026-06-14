const notificationService = require('../utils/notificationService');
const { pool } = require('../db/mysql');
const { emitToAdmins, emitToCustomer } = require('./socket');

const toOrderEventPayload = (order = {}) => ({
  orderId: order.id || order.orderId,
  orderNumber: order.order_number || order.orderNumber,
  customerId: order.customer_id || order.customerId,
  customerName: order.customer_name || order.customerName,
  address: order.address,
  paymentMethod: order.payment_method || order.paymentMethod,
  status: order.status,
  paymentStatus: order.payment_status || order.paymentStatus,
  total: order.total,
  createdAt: order.created_at || order.createdAt || new Date().toISOString(),
  updatedAt: order.updated_at || order.updatedAt || new Date().toISOString(),
});

const safeParseActionPayload = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
};

const normalizeNotification = (notification = {}) => {
  const actionPayload = notification.action_payload || notification.actionPayload || null;

  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    sourceType: notification.source_type || notification.sourceType,
    sourceId: notification.source_id || notification.sourceId,
    actionType: notification.action_type || notification.actionType,
    actionPayload: safeParseActionPayload(actionPayload),
    createdAt: notification.created_at || notification.createdAt || new Date().toISOString(),
  };
};

const emitOrderToCustomer = (order, eventName) => {
  const payload = toOrderEventPayload(order);
  emitToCustomer(payload.customerId, eventName, payload);
  emitToCustomer(payload.customerId, 'order.updated', payload);
  return payload;
};

const emitOrderCreated = (order) => {
  const payload = emitOrderToCustomer(order, 'order.created');
  emitToAdmins('admin.order.created', payload);
  return payload;
};

const emitOrderCancelled = (order) => {
  const payload = emitOrderToCustomer(order, 'order.cancelled');
  emitToCustomer(payload.customerId, 'order.status.updated', payload);
  emitToAdmins('admin.order.updated', payload);
  return payload;
};

const emitOrderStatusUpdated = (order) => {
  const payload = emitOrderToCustomer(order, 'order.status.updated');
  emitToAdmins('admin.order.updated', payload);
  return payload;
};

const emitOrderPaymentUpdated = (order) => {
  const payload = emitOrderToCustomer(order, 'order.payment.updated');
  emitToAdmins('admin.order.updated', payload);
  return payload;
};

const emitNotificationCreated = async (userId, notificationResult) => {
  if (!userId || !notificationResult?.insertId) return null;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [notificationResult.insertId, userId]
    );

    if (rows.length === 0) return null;
    return emitNotificationRow(userId, rows[0]);
  } catch (error) {
    console.error('Realtime notification emit failed:', error.message);
  }

  return null;
};

const emitNotificationRow = async (userId, notification) => {
  if (!userId || !notification) return null;

  const payload = normalizeNotification(notification);
  emitToCustomer(userId, 'notification.created', payload);

  try {
    const unreadCount = await notificationService.getUnreadCount(userId);
    emitToCustomer(userId, 'notification.unread_count.updated', { unreadCount });
  } catch (error) {
    console.error('Realtime unread count emit failed:', error.message);
  }

  return payload;
};

module.exports = {
  emitNotificationCreated,
  emitNotificationRow,
  emitOrderCancelled,
  emitOrderCreated,
  emitOrderPaymentUpdated,
  emitOrderStatusUpdated,
  toOrderEventPayload,
};
