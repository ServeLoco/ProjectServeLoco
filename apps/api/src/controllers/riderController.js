const { pool } = require('../db/mysql');
const { riderShape, syncDeliveryAvailabilityFromRiders } = require('../utils/riders');
const assignment = require('../services/riderAssignment');
const notificationService = require('../utils/notificationService');
const realtimeEvents = require('../realtime/orderEvents');
const { emitToCustomer, emitToAdmins } = require('../realtime/socket');

const shapeOrderSummary = (o) => {
  if (!o) return null;
  return {
    id: o.id,
    orderNumber: o.order_number,
    order_number: o.order_number,
    status: o.status,
    address: o.address,
    phone: o.phone,
    customerName: o.customer_name,
    customer_name: o.customer_name,
    paymentMethod: o.payment_method,
    payment_method: o.payment_method,
    total: o.total,
    note: o.note,
    riderId: o.rider_id,
    rider_id: o.rider_id,
    riderAssignedAt: o.rider_assigned_at,
    rider_assigned_at: o.rider_assigned_at,
    riderPickedUpAt: o.rider_picked_up_at,
    rider_picked_up_at: o.rider_picked_up_at,
    riderAssignmentStatus: o.rider_assignment_status,
    rider_assignment_status: o.rider_assignment_status,
    createdAt: o.created_at,
    created_at: o.created_at,
  };
};

const shapeOffer = (row) => {
  if (!row) return null;
  const expiresAt = row.expires_at;
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const secondsRemaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
  return {
    id: row.id,
    offerId: row.id,
    orderId: row.order_id,
    order_id: row.order_id,
    status: row.status,
    expiresAt,
    expires_at: expiresAt,
    secondsRemaining,
    seconds_remaining: secondsRemaining,
    orderNumber: row.order_number,
    order_number: row.order_number,
    address: row.address || null,
    phone: row.phone || null,
    customerName: row.customer_name || null,
    customer_name: row.customer_name || null,
  };
};

// GET /api/rider/me — this rider's profile + online state + current assignment summary.
const getMe = async (req, res) => {
  const rider = riderShape(req.rider);
  const [assignRows] = await pool.query(
    `SELECT * FROM orders
     WHERE rider_id = ? AND status NOT IN ('Delivered', 'Cancelled')
     ORDER BY rider_assigned_at DESC, id DESC
     LIMIT 1`,
    [req.rider.id]
  );
  const [offerRows] = await pool.query(
    `SELECT o.*, ord.order_number, ord.address, ord.phone, ord.customer_name
     FROM rider_order_offers o
     JOIN orders ord ON ord.id = o.order_id
     WHERE o.rider_id = ? AND o.status = 'pending' AND o.expires_at > NOW()
     ORDER BY o.id DESC
     LIMIT 1`,
    [req.rider.id]
  );

  res.status(200).json({
    rider,
    isOnline: rider.isOnline,
    is_online: rider.is_online,
    currentAssignment: shapeOrderSummary(assignRows[0] || null),
    current_assignment: shapeOrderSummary(assignRows[0] || null),
    activeOffer: shapeOffer(offerRows[0] || null),
    active_offer: shapeOffer(offerRows[0] || null),
  });
};

// PATCH /api/rider/me/online — body { isOnline | is_online: boolean }.
// Sets is_online, refreshes heartbeat when going online, clears when offline,
// then syncs settings.delivery_available from active rider count.
const setOnline = async (req, res) => {
  const raw = req.body.isOnline !== undefined ? req.body.isOnline : req.body.is_online;
  if (typeof raw !== 'boolean') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'isOnline (boolean) is required',
    });
  }

  if (raw) {
    await pool.query(
      'UPDATE riders SET is_online = 1, last_heartbeat_at = NOW() WHERE id = ?',
      [req.rider.id]
    );
  } else {
    await pool.query(
      'UPDATE riders SET is_online = 0, last_heartbeat_at = NULL WHERE id = ?',
      [req.rider.id]
    );
  }

  const [rows] = await pool.query(
    `SELECT id, user_id, display_name, phone, active, is_online, last_heartbeat_at
     FROM riders WHERE id = ?`,
    [req.rider.id]
  );
  req.rider = rows[0];

  // Fire-and-await so the response reflects the new delivery gate; never throws.
  await syncDeliveryAvailabilityFromRiders();

  const rider = riderShape(req.rider);
  res.status(200).json({
    message: 'Rider online status updated',
    rider,
    isOnline: rider.isOnline,
    is_online: rider.is_online,
  });
};

// POST /api/rider/me/heartbeat — keepalive while online. Refreshes last_heartbeat_at.
// If the rider is currently offline, heartbeat alone does not turn them online
// (must use /me/online); returns 400 so clients can re-toggle.
const heartbeat = async (req, res) => {
  if (!req.rider.is_online) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Rider is offline; go online before sending heartbeats',
    });
  }

  await pool.query(
    'UPDATE riders SET last_heartbeat_at = NOW() WHERE id = ? AND is_online = 1',
    [req.rider.id]
  );

  const [rows] = await pool.query(
    `SELECT id, user_id, display_name, phone, active, is_online, last_heartbeat_at
     FROM riders WHERE id = ?`,
    [req.rider.id]
  );
  req.rider = rows[0];

  res.status(200).json({
    message: 'Heartbeat recorded',
    rider: riderShape(req.rider),
  });
};

// GET /api/rider/offers/active
const getActiveOffer = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.*, ord.order_number, ord.address, ord.phone, ord.customer_name, ord.note, ord.total
     FROM rider_order_offers o
     JOIN orders ord ON ord.id = o.order_id
     WHERE o.rider_id = ? AND o.status = 'pending' AND o.expires_at > NOW()
     ORDER BY o.id DESC
     LIMIT 1`,
    [req.rider.id]
  );
  if (rows.length === 0) {
    return res.status(200).json({ offer: null });
  }
  const offer = shapeOffer(rows[0]);
  // Shop names for pickup list
  const [shops] = await pool.query(
    `SELECT DISTINCT s.id, s.name
     FROM order_items oi
     JOIN shops s ON s.id = oi.shop_id
     WHERE oi.order_id = ? AND oi.shop_id IS NOT NULL`,
    [rows[0].order_id]
  );
  offer.shops = shops;
  res.status(200).json({ offer });
};

// POST /api/rider/offers/:offerId/accept
const acceptOfferHttp = async (req, res) => {
  const offerId = Number(req.params.offerId);
  if (!Number.isFinite(offerId)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid offer id' });
  }
  const result = await assignment.acceptOffer(offerId, req.rider.id);
  if (!result.ok) {
    const status = result.status || (result.code === 'NOT_FOUND' ? 404 : result.code === 'FORBIDDEN' ? 403 : 400);
    return res.status(status).json({ code: result.code || 'ERROR', message: result.message || 'Accept failed' });
  }
  res.status(200).json({
    message: 'Offer accepted',
    order: shapeOrderSummary(result.order),
  });
};

// POST /api/rider/offers/:offerId/reject
const rejectOfferHttp = async (req, res) => {
  const offerId = Number(req.params.offerId);
  if (!Number.isFinite(offerId)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid offer id' });
  }
  const result = await assignment.rejectOffer(offerId, req.rider.id, 'manual');
  if (!result.ok) {
    const status = result.status || (result.code === 'NOT_FOUND' ? 404 : result.code === 'FORBIDDEN' ? 403 : 400);
    return res.status(status).json({ code: result.code || 'ERROR', message: result.message || 'Reject failed' });
  }
  res.status(200).json({ message: 'Offer rejected', continued: result.continued || null });
};

// GET /api/rider/assignments/current
const getCurrentAssignment = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM orders
     WHERE rider_id = ? AND status NOT IN ('Delivered', 'Cancelled')
     ORDER BY rider_assigned_at DESC, id DESC
     LIMIT 1`,
    [req.rider.id]
  );
  if (rows.length === 0) {
    return res.status(200).json({ order: null });
  }
  const order = shapeOrderSummary(rows[0]);
  const [shops] = await pool.query(
    `SELECT DISTINCT s.id, s.name
     FROM order_items oi
     JOIN shops s ON s.id = oi.shop_id
     WHERE oi.order_id = ? AND oi.shop_id IS NOT NULL`,
    [rows[0].id]
  );
  order.shops = shops;
  const [items] = await pool.query(
    `SELECT id, product_name, quantity, variant_label, shop_id
     FROM order_items WHERE order_id = ?`,
    [rows[0].id]
  );
  order.items = items.map((it) => ({
    id: it.id,
    productName: it.product_name,
    product_name: it.product_name,
    quantity: it.quantity,
    variantLabel: it.variant_label,
    variant_label: it.variant_label,
    shopId: it.shop_id,
    shop_id: it.shop_id,
  }));
  res.status(200).json({ order });
};

// GET /api/rider/assignments/history?page=1&limit=20
const getAssignmentHistory = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM orders
     WHERE rider_id = ? AND status IN ('Delivered', 'Cancelled')`,
    [req.rider.id]
  );
  const total = Number(countRows[0]?.cnt) || 0;

  const [rows] = await pool.query(
    `SELECT id, order_number, status, address, total, rider_assigned_at, rider_picked_up_at, created_at, updated_at
     FROM orders
     WHERE rider_id = ? AND status IN ('Delivered', 'Cancelled')
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`,
    [req.rider.id, limit, offset]
  );

  res.status(200).json({
    orders: rows.map(shapeOrderSummary),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
  });
};

// POST /api/rider/assignments/:orderId/cancel
const cancelAssignmentHttp = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid order id' });
  }
  const result = await assignment.cancelAssignmentByRider(orderId, req.rider.id);
  if (!result.ok) {
    return res.status(result.status || 400).json({
      code: result.code || 'ERROR',
      message: result.message || 'Cancel failed',
    });
  }
  res.status(200).json({ message: 'Assignment cancelled', continued: result.continued || null });
};

// POST /api/rider/assignments/:orderId/picked-up
const markPickedUp = async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid order id' });
  }

  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  const order = rows[0];
  if (Number(order.rider_id) !== Number(req.rider.id)) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Not your assignment' });
  }
  if (order.status === 'Cancelled' || order.status === 'Delivered') {
    return res.status(409).json({ code: 'CONFLICT', message: 'Order is terminal' });
  }

  if (!order.rider_picked_up_at) {
    await pool.query(
      'UPDATE orders SET rider_picked_up_at = NOW() WHERE id = ? AND rider_id = ? AND rider_picked_up_at IS NULL',
      [orderId, req.rider.id]
    );
  }

  const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  const updated = updatedRows[0];

  notificationService.createOrderNotification({
    userId: updated.customer_id,
    order: updated,
    event: 'rider_picked_up',
  })
    .then((result) => realtimeEvents.emitNotificationCreated(updated.customer_id, result))
    .catch(() => {});

  try {
    emitToCustomer(updated.customer_id, 'rider.assignment.updated', {
      orderId, status: 'picked_up', riderId: req.rider.id,
    });
    emitToAdmins('admin.order.rider_updated', {
      orderId, status: 'picked_up', riderId: req.rider.id,
    });
  } catch (_) { /* best-effort */ }

  res.status(200).json({
    message: 'Order marked picked up',
    order: shapeOrderSummary(updated),
  });
};

// PATCH /api/rider/assignments/:orderId/status — body { status: 'Out for Delivery' | 'Delivered' }
const updateAssignmentStatus = async (req, res) => {
  const orderId = Number(req.params.orderId);
  let { status } = req.body || {};
  if (status === 'Out for delivery') status = 'Out for Delivery';

  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid order id' });
  }
  const allowed = ['Out for Delivery', 'Delivered'];
  if (!allowed.includes(status)) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: `status must be one of: ${allowed.join(', ')}`,
    });
  }

  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  const order = rows[0];
  if (Number(order.rider_id) !== Number(req.rider.id)) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Not your assignment' });
  }
  if (order.status === 'Cancelled' || order.status === 'Delivered') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot change terminal order' });
  }

  // Forward-only among allowed progression for riders
  const progression = ['Accepted', 'Preparing', 'Out for Delivery', 'Delivered'];
  const curIdx = progression.indexOf(order.status);
  const newIdx = progression.indexOf(status);
  if (newIdx === -1 || (curIdx !== -1 && newIdx <= curIdx)) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: `Cannot move order from '${order.status}' to '${status}'`,
    });
  }
  // Rider should pick up before out for delivery (soft: auto-set if missing)
  if (status === 'Out for Delivery' && !order.rider_picked_up_at) {
    await pool.query(
      'UPDATE orders SET rider_picked_up_at = NOW() WHERE id = ? AND rider_picked_up_at IS NULL',
      [orderId]
    );
  }

  const [updateResult] = await pool.query(
    'UPDATE orders SET status = ? WHERE id = ? AND status = ? AND rider_id = ?',
    [status, orderId, order.status, req.rider.id]
  );
  if (updateResult.affectedRows === 0) {
    const [fresh] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    return res.status(409).json({
      code: 'CONCURRENCY_CONFLICT',
      message: 'Order was updated by someone else.',
      order: shapeOrderSummary(fresh[0]),
    });
  }

  const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  const updated = updatedRows[0];

  const eventName = status === 'Out for Delivery' ? 'status_out_for_delivery' : 'status_delivered';
  notificationService.createOrderNotification({
    userId: updated.customer_id,
    order: updated,
    event: eventName,
  })
    .then((result) => realtimeEvents.emitNotificationCreated(updated.customer_id, result))
    .catch(() => {});

  realtimeEvents.emitOrderStatusUpdated(updated);
  try {
    emitToAdmins('admin.order.rider_updated', {
      orderId, status, riderId: req.rider.id,
    });
  } catch (_) { /* best-effort */ }

  res.status(200).json({
    message: 'Order status updated',
    order: shapeOrderSummary(updated),
  });
};

module.exports = {
  getMe,
  setOnline,
  heartbeat,
  getActiveOffer,
  acceptOfferHttp,
  rejectOfferHttp,
  getCurrentAssignment,
  getAssignmentHistory,
  cancelAssignmentHttp,
  markPickedUp,
  updateAssignmentStatus,
};
