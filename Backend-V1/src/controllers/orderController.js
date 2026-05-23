const { pool } = require('../db/mysql');

const generateOrderNumber = async (connection) => {
  const date = new Date();
  const dateStr = date.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0].replace(/-/g, '');
  const prefix = `OD-${dateStr}-`;
  
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM orders WHERE order_number LIKE ? FOR UPDATE`,
    [`${prefix}%`]
  );
  const nextSeq = (rows[0].count + 1).toString().padStart(4, '0');
  return `${prefix}${nextSeq}`;
};

const createOrder = async (req, res) => {
  const userId = req.user.id;
  const { address, latitude, longitude, map_url, payment_method, note, items } = req.validatedData;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (user.blocked) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
    }

    const [settingRows] = await connection.query('SELECT * FROM settings LIMIT 1');
    const settings = settingRows[0];
    
    if (!settings.shop_open) throw new Error('Shop is currently closed');
    if (!settings.delivery_available) throw new Error('Delivery is currently unavailable');

    let subtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const [prodRows] = await connection.query('SELECT * FROM products WHERE id = ? AND available = 1', [item.product_id]);
      if (prodRows.length === 0) throw new Error(`Product ID ${item.product_id} is unavailable or does not exist`);
      
      const product = prodRows[0];
      const quantity = parseInt(item.quantity, 10);
      const unitPrice = parseFloat(product.price);
      const lineTotal = unitPrice * quantity;
      
      subtotal += lineTotal;
      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal
      });
    }

    if (subtotal < parseFloat(settings.minimum_order_amount)) {
      throw new Error(`Minimum order amount is ₹${settings.minimum_order_amount}`);
    }

    let deliveryCharge = parseFloat(settings.delivery_charge);
    if (settings.free_delivery_above !== null && subtotal >= parseFloat(settings.free_delivery_above)) {
      deliveryCharge = 0;
    }

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
      if (isNight) nightCharge = parseFloat(settings.night_charge);
    }

    const total = subtotal + deliveryCharge + nightCharge;
    const orderNumber = await generateOrderNumber(connection);

    const finalAddress = address || user.address;
    if (!finalAddress) throw new Error('Address is required');

    const [orderResult] = await connection.query(
      `INSERT INTO orders (
        order_number, customer_id, customer_name, phone, whatsapp_number, address,
        latitude, longitude, map_url, subtotal, delivery_charge, night_charge, total,
        payment_method, payment_status, status, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Pending', ?)`,
      [
        orderNumber, userId, user.name, user.phone, user.whatsapp_number, finalAddress,
        latitude || null, longitude || null, map_url || null,
        subtotal, deliveryCharge, nightCharge, total,
        payment_method, note || null
      ]
    );

    const orderId = orderResult.insertId;

    for (const oi of orderItems) {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, oi.product_id, oi.product_name, oi.quantity, oi.unit_price, oi.line_total]
      );
    }

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: 'Order placed successfully',
      orderId,
      orderNumber
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
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC',
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

  await pool.query(
    'UPDATE orders SET status = "Cancelled", cancel_reason = ? WHERE id = ?',
    [reason || null, id]
  );

  res.status(200).json({ message: 'Order cancelled successfully' });
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder
};
