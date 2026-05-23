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
    if (user.blocked) throw new Error('User is blocked');

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
    const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isNight = (nowStr >= settings.night_charge_start || nowStr <= settings.night_charge_end);
    if (isNight) {
      nightCharge = parseFloat(settings.night_charge);
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

module.exports = {
  createOrder
};
