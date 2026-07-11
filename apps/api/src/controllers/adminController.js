const config = require('../config/env');
const { signAdminToken } = require('../utils/auth');
const { pool } = require('../db/mysql');
const { validatePagination } = require('../validators');
const notificationService = require('../utils/notificationService');
const { notifyShopsForOrder, notifyShopsOrderCancelled } = require('../utils/shops');
const realtimeEvents = require('../realtime/orderEvents');
const orderAutoAccept = require('../realtime/orderAutoAccept');
const adminInbox = require('../utils/adminNotifications');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const ORDER_STATUS_VALUES = ['Pending', 'Accepted', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

const getCancelledPaymentStatus = (paymentMethod) => (
  paymentMethod === 'UPI' ? 'Refunded' : 'Failed'
);


const queryRows = async (sql, params) => {
  const result = await pool.query(sql, params);
  return Array.isArray(result) ? result[0] || [] : [];
};

// Account-level lockout, independent of the per-IP login rate limiter — a
// distributed brute force (many source IPs) would otherwise never trip the
// per-IP bucket. There is one shared owner account, so a single counter row
// is enough (see admin_auth_state).
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const skipLockoutCheck = () => process.env.NODE_ENV === 'test';

const login = async (req, res) => {
  const { id, password } = req.validatedData;

  const ownerId = process.env.ADMIN_OWNER_ID || config.ADMIN_OWNER_ID;
  const ownerPasswordHash = process.env.ADMIN_PASSWORD_HASH || config.ADMIN_PASSWORD_HASH;
  const ownerPassword = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD;

  if (!skipLockoutCheck()) {
    const [[state]] = await pool.query('SELECT locked_until FROM admin_auth_state WHERE id = 1');
    if (state?.locked_until && new Date(state.locked_until).getTime() > Date.now()) {
      return res.status(423).json({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed login attempts. Try again later.'
      });
    }
  }

  let isMatch = false;
  if (id === ownerId) {
    // Prefer ADMIN_PASSWORD_HASH (bcrypt) when set; otherwise fall back to
    // a constant-time plaintext comparison against ADMIN_PASSWORD.
    if (ownerPasswordHash) {
      isMatch = await bcrypt.compare(password, ownerPasswordHash);
    } else if (ownerPassword) {
      const a = Buffer.from(String(password));
      const b = Buffer.from(String(ownerPassword));
      isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
  }

  if (isMatch) {
    if (!skipLockoutCheck()) {
      await pool.query('UPDATE admin_auth_state SET failed_attempts = 0, locked_until = NULL WHERE id = 1');
    }
    const token = signAdminToken(id);
    return res.status(200).json({
      message: 'Admin login successful',
      token,
      user: { id, role: 'admin' }
    });
  }

  if (!skipLockoutCheck()) {
    // Single atomic UPDATE — the previous read-then-write (SELECT, then
    // UPDATE with the computed value) let two concurrent failed logins read
    // the same starting count and both write attempts+1, silently losing an
    // increment under a real distributed brute force. MySQL row-locks the
    // UPDATE itself, so this can't lose a count no matter how concurrent.
    //
    // ORDER MATTERS: MySQL evaluates SET assignments left-to-right using the
    // UPDATED values (nonstandard). locked_until must be assigned first, while
    // failed_attempts still holds its original value — the reverse order would
    // zero failed_attempts before the locked_until CASE reads it, and the
    // lockout would never engage.
    await pool.query(
      `UPDATE admin_auth_state
         SET locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
             failed_attempts = CASE WHEN failed_attempts + 1 >= ? THEN 0 ELSE failed_attempts + 1 END
       WHERE id = 1`,
      [LOCKOUT_THRESHOLD, new Date(Date.now() + LOCKOUT_DURATION_MS), LOCKOUT_THRESHOLD]
    );
  }

  return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid admin credentials' });
};

const me = (req, res) => {
  const adminId = req.admin.id;
  res.status(200).json({
    user: { id: adminId, role: 'admin' }
  });
};

// Kill switch for a leaked admin token: any token issued before this moment
// (including the caller's own) stops working on its next request. Does not
// touch JWT_SECRET, so customer sessions are unaffected.
const revokeSessions = async (req, res) => {
  // Whole-second precision to match JWT `iat` (also whole seconds). The
  // revocation check below uses a strict "<" so a token issued in the same
  // second as this revoke is still treated as valid — it can only exist
  // because the admin already re-logged-in after triggering the revoke.
  await pool.query(
    'UPDATE admin_auth_state SET revoked_before = NOW() WHERE id = 1'
  );
  res.status(200).json({ message: 'All admin sessions revoked. Log in again to continue.' });
};

const getAdminCustomers = async (req, res) => {
  const { search, trusted, blocked } = req.query;
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

  if (trusted !== undefined && trusted !== '') {
    query += ' AND u.trusted = ?';
    params.push(trusted === 'true' || trusted === '1' ? 1 : 0);
  }

  if (blocked !== undefined && blocked !== '') {
    query += ' AND u.blocked = ?';
    params.push(blocked === 'true' || blocked === '1' ? 1 : 0);
  }

  let countQuery = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
  const countParams = [];
  if (search) {
    countQuery += ' AND (u.name LIKE ? OR u.phone LIKE ? OR u.whatsapp_number LIKE ?)';
    const searchWildcard = `%${search}%`;
    countParams.push(searchWildcard, searchWildcard, searchWildcard);
  }
  if (trusted !== undefined && trusted !== '') {
    countQuery += ' AND u.trusted = ?';
    countParams.push(trusted === 'true' || trusted === '1' ? 1 : 0);
  }
  if (blocked !== undefined && blocked !== '') {
    countQuery += ' AND u.blocked = ?';
    countParams.push(blocked === 'true' || blocked === '1' ? 1 : 0);
  }
  const [countRows] = await pool.query(countQuery, countParams);
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

  const [result] = await pool.query('UPDATE users SET blocked = ? WHERE id = ?', [blocked ? 1 : 0, id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Customer not found' });
  }

  res.status(200).json({ message: `User ${blocked ? 'blocked' : 'unblocked'} successfully` });
};

const setTrustStatus = async (req, res) => {
  const { id, trusted } = req.validatedData;

  const [result] = await pool.query('UPDATE users SET trusted = ? WHERE id = ?', [trusted ? 1 : 0, id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Customer not found' });
  }

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
    SELECT oi.product_id, oi.item_type, oi.product_name, SUM(oi.quantity) as total_quantity, SUM(oi.line_total) as total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'Cancelled'
    GROUP BY oi.product_id, oi.item_type, oi.product_name
    ORDER BY total_sales DESC
    LIMIT 5
  `);

  const [settingsRow] = await queryRows('SELECT shop_open, delivery_available FROM settings LIMIT 1');

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
      delivery_available: settingsRow ? !!settingsRow.delivery_available : true,
      latest_orders: latestOrders,
      product_alerts: unavailableProducts,
      top_products: topProducts
    }
  });
};

const getSalesReport = async (req, res) => {
  const { period } = req.query;
  const allowedPeriods = ['today', 'week', 'month', 'all'];
  if (period && !allowedPeriods.includes(period)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid period parameter' });
  }

  let dateFilter = '1=1';
  if (period === 'today') {
    dateFilter = 'DATE(created_at) = CURDATE()';
  } else if (period === 'week') {
    dateFilter = 'YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)';
  } else if (period === 'month') {
    dateFilter = 'YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())';
  }

  const [[salesRow]] = await pool.query(`
    SELECT
      -- Rule: Revenue includes all non-cancelled orders, regardless of payment status.
      COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN total ELSE 0 END), 0) as total_revenue,
      COUNT(*) as total_orders
    FROM orders
    WHERE ${dateFilter}
  `);

  const [statusRows] = await pool.query(`SELECT status, COUNT(*) as count FROM orders WHERE ${dateFilter} GROUP BY status`);
  const [paymentBreakdownRows] = await pool.query(`SELECT payment_method, COUNT(*) as count FROM orders WHERE ${dateFilter} GROUP BY payment_method`);
  const [paymentStatusRows] = await pool.query(`SELECT payment_status, COUNT(*) as count FROM orders WHERE ${dateFilter} GROUP BY payment_status`);

  const status_breakdown = {};
  statusRows.forEach(row => { status_breakdown[row.status.toLowerCase()] = row.count; });
  const payment_breakdown = {};
  paymentBreakdownRows.forEach(row => { payment_breakdown[(row.payment_method || 'unknown').toLowerCase()] = row.count; });
  const payment_status = {};
  paymentStatusRows.forEach(row => { payment_status[(row.payment_status || 'unknown').toLowerCase()] = row.count; });

  const [[legacySalesRow]] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total ELSE 0 END), 0) as today_sales,
      COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN total ELSE 0 END), 0) as week_sales,
      COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN total ELSE 0 END), 0) as month_sales
    FROM orders
    WHERE status != 'Cancelled'
  `);

  res.status(200).json({
    total_revenue: salesRow.total_revenue,
    total_orders: salesRow.total_orders,
    status_breakdown,
    payment_breakdown,
    payment_status,
    today: legacySalesRow.today_sales,
    week: legacySalesRow.week_sales,
    month: legacySalesRow.month_sales
  });
};

const getAdminCustomerById = async (req, res) => {
  const { id } = req.params;
  const [userRows] = await pool.query('SELECT id, name, phone, whatsapp_number, address, short_address, trusted, blocked, created_at, updated_at FROM users WHERE id = ?', [id]);
  
  if (userRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Customer not found' });
  }

  const customer = userRows[0];
  const [orderRows] = await pool.query('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [id]);

  const lifetimeSpend = orderRows
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + Number(o.total), 0);

  customer.orders = orderRows;
  customer.lifetime_spend = lifetimeSpend;
  customer.order_count = orderRows.length;

  res.status(200).json({ data: customer });
};

const getTopProductsReport = async (req, res) => {
  const { period } = req.query;
  const allowedPeriods = ['today', 'week', 'month', 'all'];
  if (period && !allowedPeriods.includes(period)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid period parameter' });
  }

  let dateFilter = '1=1';
  if (period === 'today') {
    dateFilter = 'DATE(o.created_at) = CURDATE()';
  } else if (period === 'week') {
    dateFilter = 'YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)';
  } else if (period === 'month') {
    dateFilter = 'YEAR(o.created_at) = YEAR(CURDATE()) AND MONTH(o.created_at) = MONTH(CURDATE())';
  }

  const [rows] = await pool.query(`
    SELECT oi.product_id, oi.item_type, oi.product_name, SUM(oi.quantity) as total_quantity, SUM(oi.line_total) as total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'Cancelled' AND ${dateFilter}
    GROUP BY oi.product_id, oi.item_type, oi.product_name
    ORDER BY total_quantity DESC
    LIMIT 50
  `);
  res.status(200).json({ data: rows });
};

const getCustomersReport = async (req, res) => {
  const { period } = req.query;
  const allowedPeriods = ['today', 'week', 'month', 'all'];
  if (period && !allowedPeriods.includes(period)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid period parameter' });
  }

  let dateFilter = '1=1';
  if (period === 'today') {
    dateFilter = 'DATE(created_at) = CURDATE()';
  } else if (period === 'week') {
    dateFilter = 'YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)';
  } else if (period === 'month') {
    dateFilter = 'YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())';
  }

  const [[metrics]] = await pool.query(`
    SELECT
      COUNT(*) as total_customers,
      COUNT(CASE WHEN ${dateFilter} THEN 1 END) as new_customers,
      COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_customers_30d,
      COUNT(CASE WHEN trusted = 1 THEN 1 END) as trusted_customers,
      COUNT(CASE WHEN blocked = 1 THEN 1 END) as blocked_customers
    FROM users
  `);
  res.status(200).json({ data: metrics });
};

const getAdminOrders = async (req, res) => {
  const { status, paymentStatus, payment_status, paymentMethod, payment_method, search, dateFrom, from, dateTo, to, page, limit } = req.query;
  const pagination = validatePagination(page, limit);

  let query = 'SELECT id, order_number, customer_id, customer_name, phone, whatsapp_number, address, latitude, longitude, map_url, subtotal, delivery_charge, night_charge, total, delivery_type, payment_method, payment_status, status, note, cancel_reason, created_at, updated_at FROM orders WHERE 1=1';
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
  const countQueryStr = query.replace('SELECT id, order_number, customer_id, customer_name, phone, whatsapp_number, address, latitude, longitude, map_url, subtotal, delivery_charge, night_charge, total, delivery_type, payment_method, payment_status, status, note, cancel_reason, created_at, updated_at FROM orders', 'SELECT COUNT(*) as total FROM orders');
  const [countRows] = await pool.query(countQueryStr, params);
  const total = countRows[0].total;

  // Sorting and Pagination
  query += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
  const offset = (pagination.page - 1) * pagination.limit;
  params.push(pagination.limit, offset);

  const [rows] = await pool.query(query, params);

  res.status(200).json({
    data: rows,
    pagination: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit)
    }
  });
};

const getAdminOrderById = async (req, res) => {
  const { id } = req.params;

  const [orderRows] = await pool.query('SELECT id, order_number, customer_id, customer_name, phone, whatsapp_number, address, latitude, longitude, map_url, subtotal, delivery_charge, night_charge, total, delivery_type, payment_method, payment_status, status, note, cancel_reason, created_at, updated_at FROM orders WHERE id = ?', [id]);
  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  const order = orderRows[0];
  const [itemsRows] = await pool.query('SELECT oi.*, s.name AS shop_name FROM order_items oi LEFT JOIN shops s ON s.id = oi.shop_id WHERE oi.order_id = ?', [id]);

  order.items = itemsRows;

  // Per-shop confirmation state: one entry per distinct non-null shop_id among
  // the items. Orders with only house/combo items (shop_id IS NULL) get [].
  const shopMap = new Map();
  for (const it of itemsRows) {
    if (it.shop_id === null || it.shop_id === undefined) continue;
    const sid = it.shop_id;
    if (!shopMap.has(sid)) {
      shopMap.set(sid, { shopId: sid, shop_name: it.shop_name || null, items: [] });
    }
    shopMap.get(sid).items.push(it);
  }
  order.shopConfirmations = Array.from(shopMap.values()).map(e => {
    const confirmed = e.items.length > 0 && e.items.every(it => it.shop_confirmed_at !== null);
    const confirmedTimestamps = e.items.map(it => it.shop_confirmed_at).filter(Boolean);
    // .sort() on Date objects/strings is lexicographic, not chronological
    // (e.g. "Fri Aug" sorts before "Thu Jul") — compare as epoch ms instead.
    const confirmedAt = confirmedTimestamps.length > 0
      ? confirmedTimestamps.reduce((latest, ts) => (new Date(ts) > new Date(latest) ? ts : latest))
      : null;
    const ready = e.items.length > 0 && e.items.every(it => it.shop_ready_at !== null);
    const readyTimestamps = e.items.map(it => it.shop_ready_at).filter(Boolean);
    const readyAt = readyTimestamps.length > 0
      ? readyTimestamps.reduce((latest, ts) => (new Date(ts) > new Date(latest) ? ts : latest))
      : null;
    const rejected = e.items.length > 0 && e.items.every(it => it.shop_rejected_at !== null);
    const rejectedTimestamps = e.items.map(it => it.shop_rejected_at).filter(Boolean);
    const rejectedAt = rejectedTimestamps.length > 0
      ? rejectedTimestamps.reduce((latest, ts) => (new Date(ts) > new Date(latest) ? ts : latest))
      : null;
    return {
      shopId: e.shopId,
      shop_id: e.shopId,
      shopName: e.shop_name,
      shop_name: e.shop_name,
      confirmed,
      confirmedAt,
      confirmed_at: confirmedAt,
      ready,
      readyAt,
      ready_at: readyAt,
      rejected,
      rejectedAt,
      rejected_at: rejectedAt,
    };
  });

  res.status(200).json({ data: order });
};

const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  let { status, cancel_reason } = req.body;

  // Normalize spelling to match DB ENUM
  if (status === 'Canceled') status = 'Cancelled';

  const validStatuses = ORDER_STATUS_VALUES;
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Valid status required. One of: ${validStatuses.join(', ')}` });
  }

  const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  const currentStatus = orderRows[0].status;

  // Cancel the pending auto-accept (if any) the moment an admin acts on this order.
  if (currentStatus === 'Pending') {
    orderAutoAccept.cancel(parseInt(id, 10));
  }

  // Terminal states cannot be changed
  if (currentStatus === 'Delivered' || currentStatus === 'Cancelled') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot change status of a delivered or cancelled order' });
  }

  // Enforce forward-only progression
  const statusOrder = ORDER_STATUS_VALUES.filter(value => value !== 'Cancelled');
  const currentIdx = statusOrder.indexOf(currentStatus);
  const newIdx = statusOrder.indexOf(status);
  // Allow Cancelled from any non-terminal state, otherwise enforce progression
  if (status !== 'Cancelled' && newIdx !== -1 && currentIdx !== -1 && newIdx <= currentIdx) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Cannot move order from '${currentStatus}' back to '${status}'` });
  }

  if (status === 'Cancelled') {
    const cancelledPaymentStatus = getCancelledPaymentStatus(orderRows[0].payment_method);
    // Cancel + coupon-quota restore must land together: soft-cancelling the
    // redemption releases the customer's per-user use and the global count
    // (only 'active' rows count toward limits), same as a customer cancel.
    const connection = await pool.getConnection();
    let conflict = false;
    try {
      await connection.beginTransaction();
      const [cancelResult] = await connection.query(
        'UPDATE orders SET status = ?, payment_status = ?, cancel_reason = ? WHERE id = ? AND status = ?',
        [status, cancelledPaymentStatus, cancel_reason || null, id, currentStatus]
      );
      if (cancelResult.affectedRows === 0) {
        // The order status changed underneath us — do not overwrite it.
        await connection.rollback();
        conflict = true;
      } else {
        if (orderRows[0].coupon_id) {
          await connection.query(
            "UPDATE coupon_redemptions SET status = 'cancelled' WHERE order_id = ? AND coupon_id = ?",
            [id, orderRows[0].coupon_id]
          );
        }
        await connection.commit();
      }
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
    if (conflict) {
      const [freshRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
      return res.status(409).json({ code: 'CONCURRENCY_CONFLICT', message: 'Order was updated by someone else.', order: freshRows[0] });
    }
  } else {
    const [updateResult] = await pool.query('UPDATE orders SET status = ? WHERE id = ? AND status = ?', [status, id, currentStatus]);
    if (updateResult.affectedRows === 0) {
      const [freshRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
      return res.status(409).json({ code: 'CONCURRENCY_CONFLICT', message: 'Order was updated by someone else.', order: freshRows[0] });
    }
  }
  const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  const updatedOrder = updatedRows[0];

  if (currentStatus !== status) {
    let eventName = '';
    if (status === 'Accepted') eventName = 'status_accepted';
    else if (status === 'Preparing') eventName = 'status_preparing';
    else if (status === 'Out for Delivery') eventName = 'status_out_for_delivery';
    else if (status === 'Delivered') eventName = 'status_delivered';
    else if (status === 'Cancelled') eventName = 'status_cancelled';

    if (eventName) {
      notificationService.createOrderNotification({
        userId: updatedOrder.customer_id,
        order: updatedOrder,
        event: eventName
      }).then(result => realtimeEvents.emitNotificationCreated(updatedOrder.customer_id, result))
        .catch(err => console.error('[notify]', err.message));
    }

    // Shop owners must hear about an order the first time it leaves Pending —
    // an admin can jump straight from Pending to Preparing (skipping
    // Accepted), which would otherwise never fire the fan-out.
    if (currentStatus === 'Pending' && (status === 'Accepted' || status === 'Preparing')) {
      notifyShopsForOrder(updatedOrder); // fire-and-forget; owners get socket + push
    }

    // A shop already notified/preparing must be told when the order dies
    // underneath them — otherwise it silently disappears from their list.
    if (status === 'Cancelled' && (currentStatus === 'Accepted' || currentStatus === 'Preparing')) {
      notifyShopsOrderCancelled(updatedOrder);
    }

    realtimeEvents.emitOrderStatusUpdated(updatedOrder);
  }

  res.status(200).json({ message: 'Order status updated successfully', order: updatedOrder });
};

const updateOrderPayment = async (req, res) => {
  const { id } = req.params;
  const { payment_status, paymentStatus } = req.body;

  const finalStatus = payment_status || paymentStatus;
  const validPaymentStatuses = ['Pending', 'Paid', 'Failed', 'Refunded'];
  
  if (!finalStatus || !validPaymentStatuses.includes(finalStatus)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Valid payment status is required' });
  }

  const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  if (orderRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  const currentPaymentStatus = orderRows[0].payment_status;
  const currentStatus = orderRows[0].status;

  if (currentStatus === 'Canceled' || currentStatus === 'Cancelled') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Cannot update payment for a canceled order' });
  }

  // Same-value no-op must not fall through to the compare-and-set UPDATE:
  // MySQL reports affectedRows = 0 when the new value equals the old one,
  // which would be indistinguishable from a real concurrent change and
  // return a bogus 409. Answer 200 with the current row instead.
  if (finalStatus === currentPaymentStatus) {
    return res.status(200).json({ message: 'Order payment status updated successfully', order: orderRows[0] });
  }

  const [paymentResult] = await pool.query('UPDATE orders SET payment_status = ? WHERE id = ? AND payment_status = ?', [finalStatus, id, currentPaymentStatus]);
  if (paymentResult.affectedRows === 0) {
    const [freshRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
    return res.status(409).json({ code: 'CONCURRENCY_CONFLICT', message: 'Order was updated by someone else.', order: freshRows[0] });
  }
  const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
  const updatedOrder = updatedRows[0];

  if (currentPaymentStatus !== finalStatus) {
    let eventName = '';
    if (finalStatus === 'Paid') eventName = 'payment_paid';
    else if (finalStatus === 'Failed') eventName = 'payment_failed';
    else if (finalStatus === 'Refunded') eventName = 'payment_refunded';

    if (eventName) {
      notificationService.createOrderNotification({
        userId: updatedOrder.customer_id,
        order: updatedOrder,
        event: eventName
      }).then(result => realtimeEvents.emitNotificationCreated(updatedOrder.customer_id, result))
        .catch(err => console.error('[notify]', err.message));
    }

    realtimeEvents.emitOrderPaymentUpdated(updatedOrder);
  }

  res.status(200).json({ message: 'Order payment status updated successfully', order: updatedOrder });
};

const getAdminNotifications = async (req, res) => {
  const pagination = validatePagination(req.query.page, req.query.limit);
  const offset = (pagination.page - 1) * pagination.limit;

  const [rows] = await pool.query(
    'SELECT * FROM notification_batches WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [pagination.limit, offset]
  );

  const [countRows] = await pool.query('SELECT COUNT(*) as total FROM notification_batches WHERE deleted_at IS NULL');
  const total = countRows[0].total;

  res.status(200).json({
    data: rows,
    pagination: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit)
    }
  });
};

const createAdminNotification = async (req, res) => {
  const { title, body, type, target, phones } = req.body;
  const adminId = req.admin.id;

  if (!title || !body || !type || !target) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'title, body, type, and target are required' });
  }

  if (body.length > 240) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Body too long (max 240 characters)' });
  }

  // Normalise a free-form phone entry — each top-level token (comma/semicolon/newline
  // separated) is one number. Internal whitespace, dashes, parens are stripped so
  // "+91 99999-90002" matches the stored "9199999002".
  const sanitizePhones = (raw) => {
    if (!Array.isArray(raw) && typeof raw !== 'string') return [];
    const list = Array.isArray(raw)
      ? raw
      : String(raw).split(/[,;\n\r]+/);
    const seen = new Set();
    const out = [];
    for (const entry of list) {
      if (entry == null) continue;
      const cleaned = String(entry).replace(/[^\d+]/g, '');
      if (!cleaned) continue;
      // Preserve a single leading + then digits only.
      const hasPlus = cleaned.startsWith('+');
      const digits = cleaned.replace(/\D/g, '');
      const normalized = (hasPlus ? '+' : '') + digits;
      if (digits.length < 7) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  };

  let targetUserIds = [];
  let resolvedPhones = [];
  let unmatchedPhones = [];

  if (target === 'everyone') {
    const [users] = await pool.query('SELECT id FROM users WHERE blocked = 0');
    targetUserIds = users.map(u => u.id);
  } else if (target === 'phones') {
    const sanitized = sanitizePhones(phones);
    if (sanitized.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Provide at least one phone number (comma- or newline-separated).',
      });
    }

    // Generate digit-only variants for every input so a few common formats
    // match the same DB row:
    //   "9999999002"          → "9999999002"
    //   "+91 99999-9002"      → "9999999002", "9199999002", "9999999002"
    //   "9199999002"          → "9199999002", "9999999002"
    // We then query with REGEXP_REPLACE so DB-side phones get digit-stripped too.
    const digitVariants = new Set();
    for (const raw of sanitized) {
      const digitsOnly = raw.replace(/\D/g, '');
      if (!digitsOnly) continue;
      digitVariants.add(digitsOnly);
      if (digitsOnly.length > 10) digitVariants.add(digitsOnly.slice(-10));
    }
    const variants = Array.from(digitVariants);
    if (variants.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Phone numbers must contain at least 7 digits.',
      });
    }

    // Generate a digit-only form for every variant so we can compare against
    // the DB's `phone` column after stripping non-digits. Doing this in JS
    // avoids a function-on-column predicate (REGEXP_REPLACE is MySQL 8.0+
    // AND makes the WHERE non-sargable, full-scanning the users table).
    const [allUsers] = await pool.query(
      'SELECT id, phone FROM users WHERE blocked = 0 AND phone IS NOT NULL'
    );

    const stripDigits = (s) => String(s || '').replace(/\D/g, '');
    // Index each user under BOTH their full digit form AND their last-10 digits.
    // This makes matching symmetric: a plain 10-digit input matches a stored
    // number that has a country code (e.g. typed "9999999002" vs stored
    // "+919999999002"), and vice-versa. First write wins on collisions.
    const userDigitSet = new Map();   // digits-only key → user
    for (const u of allUsers) {
      const d = stripDigits(u.phone);
      if (!d) continue;
      if (!userDigitSet.has(d)) userDigitSet.set(d, u);
      if (d.length > 10) {
        const last10 = d.slice(-10);
        if (!userDigitSet.has(last10)) userDigitSet.set(last10, u);
      }
    }

    const users = [];
    const seenIds = new Set();
    for (const variant of variants) {
      // Try the full digit form first, then the last-10 form. Because users are
      // now indexed both ways, this matches regardless of which side carries the
      // country code.
      let u = userDigitSet.get(variant);
      if (!u && variant.length > 10) u = userDigitSet.get(variant.slice(-10));
      if (u && !seenIds.has(u.id)) {
        seenIds.add(u.id);
        users.push(u);
      }
    }

    if (users.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'No active customers matched any of the supplied phone numbers.',
      });
    }
    targetUserIds = users.map(u => u.id);
    resolvedPhones = users.map(u => u.phone);

    // Identify which sanitized inputs didn't resolve to any customer. Use the
    // same digit-only comparison as the matching loop above so that an admin
    // who typed a 10-digit local number sees it reported as unmatched when
    // their input had no matching row, even when stored phones carry a
    // country code (and vice-versa).
    const matchedDigitSet = new Set();
    for (const u of users) {
      const d = stripDigits(u.phone);
      if (!d) continue;
      matchedDigitSet.add(d);
      if (d.length > 10) matchedDigitSet.add(d.slice(-10));
    }
    unmatchedPhones = sanitized.filter(phone => {
      const d = stripDigits(phone);
      if (!d) return false;
      if (matchedDigitSet.has(d)) return false;
      if (d.length > 10 && matchedDigitSet.has(d.slice(-10))) return false;
      return true;
    });
  } else {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Unsupported target' });
  }

  if (targetUserIds.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No recipients found for target' });
  }

  const result = await notificationService.createBroadcastNotification({
    title,
    body,
    type,
    createdByAdminId: adminId,
    targetUserIds,
    targetName: target === 'phones' ? `phones:${resolvedPhones.join(',')}` : target
  });

  if (!result) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to create broadcast notification' });
  }

  // Emit realtime events to all recipients so they get phone notifications.
  // Was N+1 (one SELECT per user); now a single batch SELECT + parallel emit.
  try {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id IN (?) AND batch_id = ? ORDER BY id DESC',
      [targetUserIds, result.batchId]
    );
    // Group by user_id (ordered DESC so the first per user is the most recent)
    const latestByUser = new Map();
    for (const n of notifications) {
      if (!latestByUser.has(Number(n.user_id))) {
        latestByUser.set(Number(n.user_id), n);
      }
    }
    await Promise.all(
      targetUserIds.map(async (userId) => {
        const notif = latestByUser.get(Number(userId));
        if (notif) {
          try {
            realtimeEvents.emitNotificationRow(userId, notif);
          } catch (error) {
            console.error(`Failed to emit notification to user ${userId}:`, error.message);
          }
        }
      })
    );
  } catch (error) {
    console.error('Failed to batch-load broadcast notifications:', error.message);
  }

  res.status(201).json({
    success: true,
    message: 'Broadcast sent successfully',
    data: {
      batchId: result.batchId,
      recipientCount: result.count,
      pushEligibleCount: result.pushEligibleCount ?? null,
      ...(target === 'phones'
        ? { matchedPhones: resolvedPhones, unmatchedPhones }
        : {}),
    }
  });
};

const getAdminNotificationById = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT * FROM notification_batches WHERE id = ?', [id]);
  
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Notification batch not found' });
  }

  res.json({ data: rows[0] });
};

const deleteAdminNotification = async (req, res) => {
  const { id } = req.params;
  
  const [batchRows] = await pool.query('SELECT * FROM notification_batches WHERE id = ?', [id]);
  if (batchRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Notification batch not found' });
  }

  await pool.query('UPDATE notification_batches SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  await pool.query('UPDATE notifications SET deleted_at = CURRENT_TIMESTAMP WHERE batch_id = ?', [id]);

  res.json({ success: true, message: 'Broadcast deleted successfully' });
};

module.exports = {
  login,
  me,
  revokeSessions,
  getAdminCustomers,
  setBlockStatus,
  setTrustStatus,
  getDashboard,
  getSalesReport,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  updateOrderPayment,
  getAdminCustomerById,
  getTopProductsReport,
  getCustomersReport,
  getAdminNotifications,
  createAdminNotification,
  getAdminNotificationById,
  deleteAdminNotification
};

// ──────────────────────────────────────────────────────────────────────────
// Admin Inbox (bell icon). Distinct from the broadcast composer at
// /api/admin/notifications which targets customers.
// ──────────────────────────────────────────────────────────────────────────

const getInbox = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const [rows] = await pool.query(
    `SELECT id, type, title, body, related_url, related_id, read_at, created_at
       FROM admin_notifications
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [limit]
  );
  const [[count]] = await pool.query(
    'SELECT COUNT(*) AS n FROM admin_notifications WHERE read_at IS NULL'
  );
  res.status(200).json({ data: rows, unread_count: Number(count.n) || 0 });
};

const getInboxUnreadCount = async (req, res) => {
  const count = await adminInbox.getUnreadCount();
  res.status(200).json({ count });
};

const markInboxRead = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
  }
  await pool.query(
    'UPDATE admin_notifications SET read_at = NOW() WHERE id = ? AND read_at IS NULL',
    [id]
  );
  adminInbox.broadcastUnreadCount();
  res.status(200).json({ message: 'Marked as read' });
};

const markAllInboxRead = async (req, res) => {
  await pool.query('UPDATE admin_notifications SET read_at = NOW() WHERE read_at IS NULL');
  adminInbox.broadcastUnreadCount();
  res.status(200).json({ message: 'All marked as read' });
};

const dismissInbox = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
  }
  await pool.query('DELETE FROM admin_notifications WHERE id = ?', [id]);
  adminInbox.broadcastUnreadCount();
  res.status(200).json({ message: 'Dismissed' });
};

module.exports.getInbox = getInbox;
module.exports.getInboxUnreadCount = getInboxUnreadCount;
module.exports.markInboxRead = markInboxRead;
module.exports.markAllInboxRead = markAllInboxRead;
module.exports.dismissInbox = dismissInbox;
