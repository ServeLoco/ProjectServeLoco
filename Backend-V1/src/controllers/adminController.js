const config = require('../config/env');
const { signAdminToken } = require('../utils/auth');
const { pool } = require('../db/mysql');

const queryRows = async (sql, params) => {
  const result = await pool.query(sql, params);
  return Array.isArray(result) ? result[0] || [] : [];
};

const login = (req, res) => {
  const { id, password } = req.validatedData;

  // Compare against environment variables
  const ownerId = process.env.ADMIN_OWNER_ID || config.ADMIN_OWNER_ID;
  const ownerPassword = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD;

  if (id === ownerId && password === ownerPassword) {
    const token = signAdminToken(id);
    return res.status(200).json({
      message: 'Admin login successful',
      token,
      user: { id, role: 'admin' }
    });
  }

  return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid admin credentials' });
};

const me = (req, res) => {
  const adminId = req.admin.id;
  res.status(200).json({
    user: { id: adminId, role: 'admin' }
  });
};

const getAdminCustomers = async (req, res) => {
  const { search } = req.query;
  const pageNum = req.validatedData?.page || parseInt(req.query.page, 10) || 1;
  const limitNum = req.validatedData?.limit || parseInt(req.query.limit, 10) || 20;
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT u.id, u.name, u.phone, u.whatsapp_number, u.address, u.short_address, u.trusted, u.blocked, u.created_at, u.updated_at,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) as order_count
    FROM users u
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (u.name LIKE ? OR u.phone LIKE ? OR u.whatsapp_number LIKE ?)';
    const searchWildcard = `%${search}%`;
    params.push(searchWildcard, searchWildcard, searchWildcard);
  }

  let countQuery = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
  if (search) {
    countQuery += ' AND (u.name LIKE ? OR u.phone LIKE ? OR u.whatsapp_number LIKE ?)';
  }
  const [countRows] = await pool.query(countQuery, params);
  const total = countRows[0].total;

  query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const [rows] = await pool.query(query, params);

  res.status(200).json({
    data: rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  });
};

const setBlockStatus = async (req, res) => {
  const { id, blocked } = req.validatedData;

  await pool.query('UPDATE users SET blocked = ? WHERE id = ?', [blocked ? 1 : 0, id]);

  res.status(200).json({ message: `User ${blocked ? 'blocked' : 'unblocked'} successfully` });
};

const setTrustStatus = async (req, res) => {
  const { id, trusted } = req.validatedData;

  await pool.query('UPDATE users SET trusted = ? WHERE id = ?', [trusted ? 1 : 0, id]);

  res.status(200).json({ message: `User ${trusted ? 'trusted' : 'untrusted'} successfully` });
};

const getDashboard = async (req, res) => {
  const [metricsRow = {}] = await queryRows(`
    SELECT
      COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_orders,
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status != 'Cancelled' THEN total ELSE 0 END), 0) as today_sales,
      COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN status = 'Delivered' THEN 1 END) as delivered_orders,
      COALESCE(SUM(CASE WHEN payment_method = 'Cash' AND status != 'Cancelled' THEN total ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN payment_method = 'UPI' AND status != 'Cancelled' THEN total ELSE 0 END), 0) as upi_total,
      COALESCE(SUM(CASE WHEN payment_status = 'Pending' AND status != 'Cancelled' THEN total ELSE 0 END), 0) as pending_payment_total
    FROM orders
  `);

  const latestOrders = await queryRows(`
    SELECT * FROM orders 
    ORDER BY (status = 'Pending') DESC, created_at DESC 
    LIMIT 10
  `);

  const unavailableProducts = await queryRows(`
    SELECT id, name, price FROM products WHERE available = 0
  `);

  const topProducts = await queryRows(`
    SELECT oi.product_id, oi.product_name, SUM(oi.quantity) as total_quantity, SUM(oi.line_total) as total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'Cancelled'
    GROUP BY oi.product_id, oi.product_name
    ORDER BY total_sales DESC
    LIMIT 5
  `);

  const [settingsRow] = await queryRows('SELECT shop_open FROM settings LIMIT 1');

  res.status(200).json({
    data: {
      sales: {
        totalSales: metricsRow.totalSales || metricsRow.today_sales || 0,
        todaySales: metricsRow.today_sales || metricsRow.totalSales || 0,
        totalOrders: metricsRow.totalOrders || metricsRow.today_orders || 0,
        todayOrders: metricsRow.today_orders || metricsRow.totalOrders || 0,
        pendingOrders: metricsRow.pending_orders || metricsRow.pendingOrders || 0,
        deliveredOrders: metricsRow.delivered_orders || metricsRow.deliveredOrders || 0,
        cashTotal: metricsRow.cash_total || metricsRow.cashTotal || 0,
        upiTotal: metricsRow.upi_total || metricsRow.upiTotal || 0,
        pendingPaymentTotal: metricsRow.pending_payment_total || metricsRow.pendingPaymentTotal || 0
      },
      shop_open: settingsRow ? !!settingsRow.shop_open : true,
      latest_orders: latestOrders,
      product_alerts: unavailableProducts,
      top_products: topProducts
    }
  });
};

const getSalesReport = async (req, res) => {
  const [[salesRow]] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total ELSE 0 END), 0) as today_sales,
      COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN total ELSE 0 END), 0) as week_sales,
      COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN total ELSE 0 END), 0) as month_sales
    FROM orders
    WHERE status != 'Cancelled'
  `);

  res.status(200).json({
    today: salesRow.today_sales,
    week: salesRow.week_sales,
    month: salesRow.month_sales
  });
};

const getAdminOrders = async (req, res) => {
  const { status, paymentStatus, payment_status, paymentMethod, payment_method, search, dateFrom, from, dateTo, to, page = 1, limit = 20 } = req.query;

  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  const finalStatus = status;
  const finalPaymentStatus = paymentStatus || payment_status;
  const finalPaymentMethod = paymentMethod || payment_method;
  const finalDateFrom = dateFrom || from;
  const finalDateTo = dateTo || to;

  if (finalStatus) {
    query += ' AND status = ?';
    params.push(finalStatus);
  }

  if (finalPaymentStatus) {
    query += ' AND payment_status = ?';
    params.push(finalPaymentStatus);
  }

  if (finalPaymentMethod) {
    query += ' AND payment_method = ?';
    params.push(finalPaymentMethod);
  }

  if (search) {
    query += ' AND (order_number LIKE ? OR customer_name LIKE ? OR phone LIKE ?)';
    const searchWildcard = `%${search}%`;
    params.push(searchWildcard, searchWildcard, searchWildcard);
  }

  if (finalDateFrom) {
    query += ' AND DATE(created_at) >= ?';
    params.push(finalDateFrom);
  }

  if (finalDateTo) {
    query += ' AND DATE(created_at) <= ?';
    params.push(finalDateTo);
  }

  // Count total for pagination
  const [countRows] = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
  const total = countRows[0].total;

  // Sorting and Pagination
  query += ` ORDER BY (status = 'Pending') DESC, created_at DESC LIMIT ? OFFSET ?`;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  params.push(parseInt(limit, 10), offset);

  const [rows] = await pool.query(query, params);

  res.status(200).json({
    data: rows,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    }
  });
};

const getAdminOrderById = async (req, res) => {
  const { id } = req.params;

  const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  const order = orderRows[0];
  const [itemsRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

  order.items = itemsRows;
  res.status(200).json({ data: order });
};

const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  let { status, cancel_reason } = req.body;

  // Normalize spelling to match DB ENUM
  if (status === 'Canceled') status = 'Cancelled';

  const validStatuses = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Valid status required. One of: ${validStatuses.join(', ')}` });
  }

  const [orderRows] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  const currentStatus = orderRows[0].status;

  // Terminal states cannot be changed
  if (currentStatus === 'Delivered' || currentStatus === 'Cancelled') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot change status of a delivered or cancelled order' });
  }

  // Enforce forward-only progression
  const statusOrder = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered'];
  const currentIdx = statusOrder.indexOf(currentStatus);
  const newIdx = statusOrder.indexOf(status);
  // Allow Cancelled from any non-terminal state, otherwise enforce progression
  if (status !== 'Cancelled' && newIdx !== -1 && currentIdx !== -1 && newIdx <= currentIdx) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Cannot move order from '${currentStatus}' back to '${status}'` });
  }

  await pool.query('UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?', [status, cancel_reason || null, id]);
  const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);

  res.status(200).json({ message: 'Order status updated successfully', order: updatedRows[0] });
};

const updateOrderPayment = async (req, res) => {
  const { id } = req.params;
  const { payment_status, paymentStatus } = req.body;

  const finalStatus = payment_status || paymentStatus;
  const validPaymentStatuses = ['Pending', 'Paid', 'Failed', 'Refunded'];
  
  if (!finalStatus || !validPaymentStatuses.includes(finalStatus)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Valid payment status is required' });
  }

  const [orderRows] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  const currentStatus = orderRows[0].status;

  if (currentStatus === 'Canceled' || currentStatus === 'Cancelled') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot update payment for a canceled order' });
  }

  await pool.query('UPDATE orders SET payment_status = ? WHERE id = ?', [finalStatus, id]);
  const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);

  res.status(200).json({ message: 'Order payment status updated successfully', order: updatedRows[0] });
};

module.exports = {
  login,
  me,
  getAdminCustomers,
  setBlockStatus,
  setTrustStatus,
  getDashboard,
  getSalesReport,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  updateOrderPayment
};
