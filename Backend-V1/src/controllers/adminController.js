const config = require('../config/env');
const { signAdminToken } = require('../utils/auth');
const { pool } = require('../db/mysql');

const login = (req, res) => {
  const { id, password } = req.validatedData;

  // Compare against environment variables
  if (id === config.ADMIN_OWNER_ID && password === config.ADMIN_PASSWORD) {
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

const getUsers = async (req, res) => {
  const { page, limit } = req.validatedData;
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    'SELECT id, name, phone, whatsapp_number, address, trusted, blocked, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );

  const [countRows] = await pool.query('SELECT COUNT(*) as total FROM users');
  const total = countRows[0].total;

  res.status(200).json({
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
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
  const [[metricsRow]] = await pool.query(`
    SELECT
      COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_orders,
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status != 'Canceled' THEN total ELSE 0 END), 0) as today_sales,
      COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN status = 'Delivered' THEN 1 END) as delivered_orders,
      COALESCE(SUM(CASE WHEN payment_method = 'Cash' AND status != 'Canceled' THEN total ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN payment_method = 'UPI' AND status != 'Canceled' THEN total ELSE 0 END), 0) as upi_total,
      COALESCE(SUM(CASE WHEN payment_status = 'Pending' AND status != 'Canceled' THEN total ELSE 0 END), 0) as pending_payment_total
    FROM orders
  `);

  const [latestOrders] = await pool.query(`
    SELECT * FROM orders 
    ORDER BY (status = 'Pending') DESC, created_at DESC 
    LIMIT 10
  `);

  const [unavailableProducts] = await pool.query(`
    SELECT id, name, price FROM products WHERE available = 0
  `);

  const [topProducts] = await pool.query(`
    SELECT oi.product_id, oi.product_name, SUM(oi.quantity) as total_quantity, SUM(oi.line_total) as total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'Canceled'
    GROUP BY oi.product_id, oi.product_name
    ORDER BY total_sales DESC
    LIMIT 5
  `);

  const [[settingsRow]] = await pool.query('SELECT shop_open FROM settings LIMIT 1');

  const metrics = { ...metricsRow };

  res.status(200).json({
    ...metrics,
    metrics,
    shop_open: settingsRow ? !!settingsRow.shop_open : true,
    latest_orders: latestOrders,
    product_alerts: unavailableProducts,
    top_products: topProducts
  });
};

const getSalesReport = async (req, res) => {
  const [[salesRow]] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total ELSE 0 END), 0) as today_sales,
      COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN total ELSE 0 END), 0) as week_sales,
      COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN total ELSE 0 END), 0) as month_sales
    FROM orders
    WHERE status != 'Canceled'
  `);

  res.status(200).json({
    today: salesRow.today_sales,
    week: salesRow.week_sales,
    month: salesRow.month_sales
  });
};

module.exports = {
  login,
  me,
  getUsers,
  setBlockStatus,
  setTrustStatus,
  getDashboard,
  getSalesReport
};
