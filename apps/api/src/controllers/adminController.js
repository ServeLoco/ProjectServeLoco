const config = require('../config/env');
const { signAdminToken } = require('../utils/auth');
const { pool } = require('../db/mysql');
const { validatePagination } = require('../validators');
const notificationService = require('../utils/notificationService');
const realtimeEvents = require('../realtime/orderEvents');
const orderAutoAccept = require('../realtime/orderAutoAccept');
const adminInbox = require('../utils/adminNotifications');
const bcrypt = require('bcrypt');

const ORDER_STATUS_VALUES = ['Pending', 'Accepted', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

const getCancelledPaymentStatus = (paymentMethod) => (
  paymentMethod === 'UPI' ? 'Refunded' : 'Failed'
);


const queryRows = async (sql, params) => {
  const result = await pool.query(sql, params);
  return Array.isArray(result) ? result[0] || [] : [];
};

const login = async (req, res) => {
  const { id, password } = req.validatedData;

  const ownerId = process.env.ADMIN_OWNER_ID || config.ADMIN_OWNER_ID;
  const ownerPasswordHash = process.env.ADMIN_PASSWORD_HASH || config.ADMIN_PASSWORD_HASH;
  const ownerPassword = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD;

  if (id === ownerId) {
    let isMatch = false;

    // Prefer ADMIN_PASSWORD (plaintext env var). Simpler to manage than a
    // hash for a single-admin setup, and the env file is gitignored + only
    // readable on the server. ADMIN_PASSWORD_HASH is still accepted as a
    // fallback for anyone who already set one up.
    if (ownerPassword) {
      isMatch = (password === ownerPassword);
    } else if (ownerPasswordHash) {
      isMatch = await bcrypt.compare(password, ownerPasswordHash);
    }

    if (isMatch) {
      const token = signAdminToken(id);
      return res.status(200).json({
        message: 'Admin login successful',
        token,
        user: { id, role: 'admin' }
      });
    }
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
  const [resetRows] = await pool.query(
    `SELECT id, status, requested_at
     FROM password_reset_requests
     WHERE user_id = ? AND status = 'pending'
     ORDER BY requested_at DESC
     LIMIT 1`,
    [id]
  );
  
  const lifetimeSpend = orderRows
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + Number(o.total), 0);
  
  customer.orders = orderRows;
  customer.pending_password_reset_request = resetRows[0] || null;
  customer.lifetime_spend = lifetimeSpend;
  customer.order_count = orderRows.length;

  res.status(200).json({ data: customer });
};

const getPasswordResetRequests = async (req, res) => {
  const { status = 'pending' } = req.query;
  const allowedStatuses = ['pending', 'approved', 'rejected'];
  const finalStatus = allowedStatuses.includes(status) ? status : 'pending';

  const [rows] = await pool.query(
    `SELECT prr.id, prr.user_id, prr.status, prr.requested_at, prr.reviewed_at, prr.reviewed_by_admin_id,
            u.name, u.phone, u.whatsapp_number
     FROM password_reset_requests prr
     JOIN users u ON u.id = prr.user_id
     WHERE prr.status = ?
     ORDER BY prr.requested_at DESC
     LIMIT 100`,
    [finalStatus]
  );

  res.status(200).json({ data: rows });
};

const approvePasswordResetRequest = async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query(
    'SELECT id, user_id, password_hash, status, requested_at FROM password_reset_requests WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Password reset request not found' });
  }

  const request = rows[0];
  if (request.status !== 'pending') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Password reset request is already reviewed' });
  }

  const requestedAt = new Date(request.requested_at);
  const now = new Date();
  const diffHours = (now - requestedAt) / (1000 * 60 * 60);

  if (diffHours > 72) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Password reset request is older than 72 hours' });
  }

  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [request.password_hash, request.user_id]);
  await pool.query(
    `UPDATE password_reset_requests
     SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_admin_id = ?
     WHERE id = ?`,
    [req.admin.id, id]
  );

  res.status(200).json({ message: 'Password reset request approved successfully' });
};

const rejectPasswordResetRequest = async (req, res) => {
  const { id } = req.params;

  const [result] = await pool.query(
    `UPDATE password_reset_requests
     SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_admin_id = ?
     WHERE id = ? AND status = 'pending'`,
    [req.admin.id, id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Pending password reset request not found' });
  }

  res.status(200).json({ message: 'Password reset request rejected successfully' });
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

const getAuditLogs = async (req, res) => {
  try {
    const { getDb } = require('../db/mongodb');
    const db = getDb();
    
    const pagination = validatePagination(req.query.page, req.query.limit);
    const skip = (pagination.page - 1) * pagination.limit;

    const total = await db.collection('audit_logs').countDocuments();
    const logs = await db.collection('audit_logs')
      .find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pagination.limit)
      .toArray();

    res.status(200).json({
      data: logs,
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit)
      }
    });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Failed to fetch audit logs' });
  }
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
  const [itemsRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

  order.items = itemsRows;
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
      }).then(result => realtimeEvents.emitNotificationCreated(updatedOrder.customer_id, result));
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
      }).then(result => realtimeEvents.emitNotificationCreated(updatedOrder.customer_id, result));
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
      ...(target === 'phones' ? { matchedPhones: resolvedPhones } : {}),
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
  getPasswordResetRequests,
  approvePasswordResetRequest,
  rejectPasswordResetRequest,
  getTopProductsReport,
  getCustomersReport,
  getAuditLogs,
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
  try {
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
  } catch (e) {
    res.status(500).json({ code: 'SERVER_ERROR', message: e.message });
  }
};

const getInboxUnreadCount = async (req, res) => {
  try {
    const count = await adminInbox.getUnreadCount();
    res.status(200).json({ count });
  } catch (e) {
    res.status(500).json({ code: 'SERVER_ERROR', message: e.message });
  }
};

const markInboxRead = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
  }
  try {
    await pool.query(
      'UPDATE admin_notifications SET read_at = NOW() WHERE id = ? AND read_at IS NULL',
      [id]
    );
    adminInbox.broadcastUnreadCount();
    res.status(200).json({ message: 'Marked as read' });
  } catch (e) {
    res.status(500).json({ code: 'SERVER_ERROR', message: e.message });
  }
};

const markAllInboxRead = async (req, res) => {
  try {
    await pool.query('UPDATE admin_notifications SET read_at = NOW() WHERE read_at IS NULL');
    adminInbox.broadcastUnreadCount();
    res.status(200).json({ message: 'All marked as read' });
  } catch (e) {
    res.status(500).json({ code: 'SERVER_ERROR', message: e.message });
  }
};

const dismissInbox = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid id' });
  }
  try {
    await pool.query('DELETE FROM admin_notifications WHERE id = ?', [id]);
    adminInbox.broadcastUnreadCount();
    res.status(200).json({ message: 'Dismissed' });
  } catch (e) {
    res.status(500).json({ code: 'SERVER_ERROR', message: e.message });
  }
};

module.exports.getInbox = getInbox;
module.exports.getInboxUnreadCount = getInboxUnreadCount;
module.exports.markInboxRead = markInboxRead;
module.exports.markAllInboxRead = markAllInboxRead;
module.exports.dismissInbox = dismissInbox;
