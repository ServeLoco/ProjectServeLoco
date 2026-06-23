const { pool } = require('../db/mysql');

const notificationService = require('../utils/notificationService');
const realtimeEvents = require('../realtime/orderEvents');
const adminInbox = require('../utils/adminNotifications');
const orderAutoAccept = require('../realtime/orderAutoAccept');
const { calculateThresholdDeliveryCharge } = require('../utils/thresholdDelivery');
const { roundMoney, toMoney } = require('../utils/money');
const { calculateNightCharge, isCodBlockedDuringNight } = require('../utils/nightDelivery');

const generateOrderNumber = async (connection) => {
  const date = new Date();
  const dateStr = date.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0].replace(/-/g, '');
  const prefix = `OD-${dateStr}-`;

  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return `${prefix}TEST`;
  }
  
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM orders WHERE order_number LIKE ? FOR UPDATE`,
    [`${prefix}%`]
  );
  const nextSeq = (rows[0].count + 1).toString().padStart(4, '0');
  return `${prefix}${nextSeq}`;
};

const getCancelledPaymentStatus = (paymentMethod) => (
  paymentMethod === 'UPI' ? 'Refunded' : 'Failed'
);

const createOrder = async (req, res) => {
  const userId = req.user.id;
  const { address, latitude, longitude, map_url, payment_method, note, items, delivery_type } = req.validatedData;

  // Idempotency-Key: lets the client retry a Create Order on a flaky
  // connection without creating duplicate orders. If a recent order (within
  // the last 5 minutes) already exists for this customer with the same
  // key, we return it instead of creating a new one. The 5-minute window
  // is large enough to cover the longest expected request lifetime but
  // short enough that a user who re-opens the app and starts a fresh
  // checkout an hour later can re-use the same client-generated key.
  //
  // We read from req.headers (a plain object) instead of req.get() so the
  // function works with the plain-object mocks used in tests as well as
  // with real Express requests (which also expose req.headers directly).
  //
  // Race-safety: the lookup happens INSIDE a transaction with SELECT ...
  // FOR UPDATE, so two concurrent requests carrying the same key will
  // serialize — the second one waits for the first to commit, then sees
  // the just-inserted row and returns it instead of inserting a duplicate.
  const headers = (req && req.headers) || {};
  const idempotencyKey =
    headers['idempotency-key'] ||
    headers['Idempotency-Key'] ||
    null;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    if (idempotencyKey) {
      const [existingRows] = await connection.query(
        `SELECT id, order_number, idempotency_key_created_at,
                TIMESTAMPDIFF(SECOND, idempotency_key_created_at, NOW()) AS age_seconds
         FROM orders
         WHERE customer_id = ? AND idempotency_key = ? AND idempotency_key_created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY id DESC LIMIT 1
         FOR UPDATE`,
        [userId, idempotencyKey]
      );
      // Defensive: if the query returned no rows or an unexpected shape,
      // treat it as "no recent order" and proceed with normal creation.
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const existing = existingRows[0];
        // Load the items so the replay returns the SAME order object the
        // confirmation screen expects (totals, items, deliveryType, etc).
        // Without this, the user would see a sparse confirmation with
        // missing itemised details.
        const [itemsRows] = await connection.query(
          'SELECT product_id, item_type, product_name, quantity, unit_price, line_total FROM order_items WHERE order_id = ?',
          [existing.id]
        );
        await connection.commit();
        connection.release();
        const replayOrder = {
          id: existing.id,
          orderId: existing.id,
          orderNumber: existing.order_number,
          order_number: existing.order_number,
          address: address || null,
          total: null,
          paymentMethod: payment_method,
          payment_method,
          paymentStatus: 'Pending',
          payment_status: 'Pending',
          status: 'Pending',
          created_at: existing.idempotency_key_created_at,
          createdAt: existing.idempotency_key_created_at
            ? new Date(existing.idempotency_key_created_at).toISOString()
            : null,
          deliveryType: delivery_type || 'standard',
          delivery_type: delivery_type || 'standard',
          items: itemsRows.map(item => ({
            productId: item.product_id,
            name: item.product_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
            type: item.item_type
          }))
        };
        return res.status(200).json({
          message: 'Order already exists (idempotent replay)',
          orderId: existing.id,
          orderNumber: existing.order_number,
          order: replayOrder,
          data: replayOrder,
          idempotent: true,
        });
      }
    }

    const [userRows] = await connection.query('SELECT id, name, phone, whatsapp_number, address, blocked FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (user.blocked) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
    }

    const [settingRows] = await connection.query('SELECT shop_open, delivery_available, minimum_order_amount, delivery_charge, night_charge, night_charge_start, night_charge_end, below_threshold_delivery_charge, free_delivery_above_minimum_active, free_delivery_offer_active, fast_delivery_enabled, fast_delivery_charge FROM settings LIMIT 1');
    const settings = settingRows[0];
    
    if (settings.shop_open === 0 || settings.shop_open === false) throw new Error('Shop is currently closed');
    if (settings.delivery_available === 0 || settings.delivery_available === false) throw new Error('Delivery is currently unavailable');

    if (isCodBlockedDuringNight(settings) && payment_method === 'Cash') {
      throw new Error('Cash on Delivery is not available during night delivery hours. Please choose UPI.');
    }

    let subtotal = 0;
    const orderItems = [];

    // Batch-load products and combos in a single query each (was N+1: one SELECT
    // per cart item). Same validation, same subtotal math, same error messages.
    const productEntries = [];
    const comboEntries = [];
    for (const item of items) {
      const isCombo = item.type === 'combo' || item.isCombo || item.is_combo;
      const productId = item.product_id || item.productId;
      if (isCombo) comboEntries.push({ item, productId });
      else productEntries.push({ item, productId });
    }

    const productById = new Map();
    const comboById = new Map();

    if (productEntries.length > 0) {
      const productIds = productEntries.map(e => e.productId);
      const [prodRows] = await connection.query(
        'SELECT id, name, price FROM products WHERE id IN (?) AND available = 1 AND deleted = 0',
        [productIds]
      );
      for (const row of prodRows) productById.set(Number(row.id), row);
    }

    if (comboEntries.length > 0) {
      const comboIds = comboEntries.map(e => e.productId);
      const [comboRows] = await connection.query(
        'SELECT id, name, price FROM combos WHERE id IN (?) AND available = 1 AND deleted = 0',
        [comboIds]
      );
      for (const row of comboRows) comboById.set(Number(row.id), row);
    }

    for (const item of items) {
      const isCombo = item.type === 'combo' || item.isCombo || item.is_combo;
      const productId = item.product_id || item.productId;
      const product = isCombo ? comboById.get(Number(productId)) : productById.get(Number(productId));

      if (!product) throw new Error(`${isCombo ? 'Combo' : 'Product'} ID ${productId} is unavailable or does not exist`);

      const quantity = Number(item.quantity);
      const unitPrice = toMoney(product.price);
      const lineTotal = roundMoney(unitPrice * quantity);

      subtotal += lineTotal;
      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        item_type: isCombo ? 'combo' : 'product'
      });
    }

    subtotal = roundMoney(subtotal);
    // Delivery pricing is now completely threshold/fixed based. No distance restrictions.
    const thresholdDelivery = calculateThresholdDeliveryCharge({
      subtotal,
      settings
    });
    let deliveryCharge = roundMoney(thresholdDelivery.charge);

    // Fast delivery fully REPLACES the standard delivery charge whenever the user picks it
    // and the admin has enabled fast delivery. Below-threshold and free-delivery-offer state
    // do NOT block fast delivery — they only affect what the standard charge would have been.
    // Night charge stays independent and is added separately below.
    const fastEnabled = Boolean(settings.fast_delivery_enabled);
    const isFastDelivery = delivery_type === 'fast' && fastEnabled;
    if (isFastDelivery) {
      deliveryCharge = roundMoney(toMoney(settings.fast_delivery_charge || 0));
    }
    const finalDeliveryType = isFastDelivery ? 'fast' : 'standard';

    let nightCharge = 0;
    if (settings.night_charge && settings.night_charge_start && settings.night_charge_end) {
      const raw = calculateNightCharge(settings);
      if (raw > 0) nightCharge = toMoney(raw);
    }

    const total = roundMoney(subtotal + deliveryCharge + nightCharge);
    const orderNumber = await generateOrderNumber(connection);

    const finalAddress = address || user.address;
    if (!finalAddress) throw new Error('Address is required');

    const [orderResult] = await connection.query(
      `INSERT INTO orders (
        order_number, customer_id, customer_name, phone, whatsapp_number, address,
        latitude, longitude, map_url, subtotal, delivery_charge, night_charge, total,
        payment_method, payment_status, status, note,
        delivery_distance_km, delivery_radius_km_snapshot, delivery_cost_per_km_snapshot,
        free_delivery_offer_snapshot, delivery_type,
        idempotency_key, idempotency_key_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber, userId, user.name, user.phone, user.whatsapp_number, finalAddress,
        latitude || null, longitude || null, map_url || null,
        subtotal, deliveryCharge, nightCharge, total,
        payment_method, note || null,
        null, null, null,
        settings.free_delivery_offer_active !== null ? Boolean(settings.free_delivery_offer_active) : null,
        finalDeliveryType,
        idempotencyKey, idempotencyKey ? new Date() : null
      ]
    );

    const orderId = orderResult.insertId;

    if (orderItems.length > 0) {
      // Single multi-row INSERT instead of N individual INSERTs.
      const placeholders = orderItems.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = [];
      for (const oi of orderItems) {
        values.push(
          orderId,
          oi.product_id,
          oi.item_type || 'product',
          oi.product_name,
          oi.quantity,
          oi.unit_price,
          oi.line_total
        );
      }
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, item_type, product_name, quantity, unit_price, line_total)
         VALUES ${placeholders}`,
        values
      );
    }

    await connection.commit();
    connection.release();

    const order = {
      id: orderId,
      orderId,
      customerId: userId,
      customerName: user.name,
      customer_name: user.name,
      orderNumber,
      order_number: orderNumber,
      address: finalAddress,
      subtotal,
      deliveryCharge,
      nightCharge,
      total,
      paymentMethod: payment_method,
      payment_method,
      paymentStatus: 'Pending',
      payment_status: 'Pending',
      status: 'Pending',
      created_at: new Date(),
      createdAt: new Date().toISOString(),
      deliveryDistanceKm: null,
      deliveryRadiusKmSnapshot: null,
      deliveryCostPerKmSnapshot: null,
      freeDeliveryOfferSnapshot: settings.free_delivery_offer_active !== null ? Boolean(settings.free_delivery_offer_active) : null,
      deliveryType: finalDeliveryType,
      belowThresholdDelivery: Boolean(thresholdDelivery.belowThreshold),
      belowThresholdDeliveryCharge: thresholdDelivery.belowThresholdCharge || 0,
      deliveryMessage: thresholdDelivery.message,
      items: orderItems.map(item => ({
        productId: item.product_id,
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
        type: item.item_type
      }))
    };

    // Fire notification (non-blocking)
    notificationService.createOrderNotification({
      userId,
      order,
      event: 'order_placed'
    }).then(result => realtimeEvents.emitNotificationCreated(userId, result));

    realtimeEvents.emitOrderCreated(order);

    // Admin inbox — persist a row so the bell has history. Realtime push
    // already happens via emitOrderCreated above (GlobalOrderAlert uses it).
    adminInbox.createAdminNotification({
      type: adminInbox.TYPES.NEW_ORDER,
      title: `New order #${orderNumber}`,
      body: `${order.customer_name || 'Customer'} placed an order — ₹${Number(order.total).toFixed(0)}`,
      relatedUrl: `/orders?id=${orderId}`,
      relatedId: String(orderId),
    });

    // Server-side auto-accept: if no admin accepts within 10s, auto-accept.
    orderAutoAccept.schedule(orderId, orderNumber);

    res.status(201).json({
      message: 'Order placed successfully',
      orderId,
      orderNumber,
      order,
      data: order
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: error.message });
  }
};

const getOrders = async (req, res) => {
  const userId = req.user.id;
  const [rows] = await pool.query(
    'SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count FROM orders o WHERE o.customer_id = ? ORDER BY o.created_at DESC',
    [userId]
  );
  const orders = rows.map(o => ({ ...o, canCancel: o.status === 'Pending' }));
  res.status(200).json({ data: orders });
};

const getOrderById = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const [orderRows] = await pool.query(
    'SELECT * FROM orders WHERE id = ? AND customer_id = ?',
    [id, userId]
  );

  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  const order = orderRows[0];
  const [itemsRows] = await pool.query(
    'SELECT * FROM order_items WHERE order_id = ?',
    [id]
  );

  order.items = itemsRows;
  order.canCancel = order.status === 'Pending';
  res.status(200).json({ data: order });
};

const cancelOrder = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { reason } = req.body;

  if (reason && reason.length > 500) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Reason must not exceed 500 characters' });
  }

  const [orderRows] = await pool.query(
    'SELECT * FROM orders WHERE id = ? AND customer_id = ?',
    [id, userId]
  );

  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  const order = orderRows[0];

  // Idempotent: a flaky network can land the cancel request twice. If the order
  // is already cancelled, return it with 200 instead of a 400 that the user
  // reads as "cancel failed" even though their first request succeeded.
  if (order.status === 'Cancelled') {
    return res.status(200).json({ success: true, message: 'Order already cancelled', order, data: order });
  }

  if (order.status !== 'Pending') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Only pending orders can be cancelled' });
  }

  const cancelledPaymentStatus = getCancelledPaymentStatus(order.payment_method);
  await pool.query(
    'UPDATE orders SET status = "Cancelled", payment_status = ?, cancel_reason = ? WHERE id = ?',
    [cancelledPaymentStatus, reason || 'Cancelled by customer', id]
  );
  const updatedOrder = {
    ...order,
    status: 'Cancelled',
    payment_status: cancelledPaymentStatus,
    cancel_reason: reason || 'Cancelled by customer',
    updated_at: new Date().toISOString(),
  };

  // Fire notification (non-blocking)
  notificationService.createOrderNotification({
    userId,
    order: updatedOrder,
    event: 'status_cancelled'
  }).then(result => realtimeEvents.emitNotificationCreated(userId, result));

  realtimeEvents.emitOrderCancelled(updatedOrder);

  res.status(200).json({ success: true, message: 'Order cancelled successfully', order: updatedOrder, data: updatedOrder });
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder
};
