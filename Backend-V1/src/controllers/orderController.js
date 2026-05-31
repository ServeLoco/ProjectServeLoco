const { pool } = require('../db/mysql');
// Location-based pricing is removed, so calculateDeliveryPricing is no longer imported
const notificationService = require('../utils/notificationService');
const realtimeEvents = require('../realtime/orderEvents');
const { calculateThresholdDeliveryCharge } = require('../utils/thresholdDelivery');
const { roundMoney, toMoney } = require('../utils/money');

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

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
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

    let subtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const isCombo = item.type === 'combo' || item.isCombo || item.is_combo;
      const productId = item.product_id || item.productId;
      let prodRows;

      if (isCombo) {
        [prodRows] = await connection.query('SELECT id, name, price FROM combos WHERE id = ? AND available = 1 AND deleted = 0', [productId]);
      } else {
        [prodRows] = await connection.query('SELECT id, name, price FROM products WHERE id = ? AND available = 1 AND deleted = 0', [productId]);
      }

      if (prodRows.length === 0) throw new Error(`${isCombo ? 'Combo' : 'Product'} ID ${productId} is unavailable or does not exist`);
      
      const product = prodRows[0];
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

    // Fast delivery replaces only the standard delivery_charge (not night charge or below-threshold charge)
    const fastEnabled = Boolean(settings.fast_delivery_enabled);
    const isFastDelivery = delivery_type === 'fast' && fastEnabled &&
      !thresholdDelivery.freeDeliveryOfferActive && !thresholdDelivery.belowThreshold;
    if (isFastDelivery) {
      deliveryCharge = roundMoney(toMoney(settings.fast_delivery_charge || 0));
    }
    const finalDeliveryType = isFastDelivery ? 'fast' : 'standard';

    let nightCharge = 0;
    if (settings.night_charge && parseFloat(settings.night_charge) > 0 &&
        settings.night_charge_start && settings.night_charge_end) {
      const toMinutes = (t) => {
        const str = typeof t === 'string' ? t : String(t);
        const parts = str.split(':').map(Number);
        return (parts[0] || 0) * 60 + (parts[1] || 0);
      };
      const now = new Date();
      const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const nowMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();
      const startMin = toMinutes(settings.night_charge_start);
      const endMin = toMinutes(settings.night_charge_end);
      const isNight = startMin > endMin
        ? (nowMinutes >= startMin || nowMinutes <= endMin)
        : (nowMinutes >= startMin && nowMinutes <= endMin);
      if (isNight) nightCharge = toMoney(settings.night_charge);
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
        free_delivery_offer_snapshot, delivery_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Pending', ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber, userId, user.name, user.phone, user.whatsapp_number, finalAddress,
        latitude || null, longitude || null, map_url || null,
        subtotal, deliveryCharge, nightCharge, total,
        payment_method, note || null,
        null, null, null,
        settings.free_delivery_offer_active !== null ? Boolean(settings.free_delivery_offer_active) : null,
        finalDeliveryType
      ]
    );

    const orderId = orderResult.insertId;

    for (const oi of orderItems) {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, item_type, product_name, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, oi.product_id, oi.item_type || 'product', oi.product_name, oi.quantity, oi.unit_price, oi.line_total]
      );
    }

    await connection.commit();
    connection.release();

    const order = {
      id: orderId,
      orderId,
      customerId: userId,
      orderNumber,
      address: finalAddress,
      subtotal,
      deliveryCharge,
      nightCharge,
      total,
      paymentMethod: payment_method,
      paymentStatus: 'Pending',
      status: 'Pending',
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
