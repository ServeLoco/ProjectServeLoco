const { pool } = require('../db/mysql');
const notificationService = require('../utils/notificationService');
const { validatePagination } = require('../validators');
const { emitUnreadCountUpdated } = require('../realtime/orderEvents');

const safeParseActionPayload = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getNotifications = async (req, res) => {
  const userId = req.user.id;
  const pagination = validatePagination(req.query.page, req.query.limit);
  const unreadOnly = req.query.unreadOnly === 'true';
  const offset = (pagination.page - 1) * pagination.limit;

  let query = 'SELECT id, title, body, type, source_type, source_id, action_type, action_payload, read_at, created_at FROM notifications WHERE user_id = ? AND deleted_at IS NULL';
  const params = [userId];

  if (unreadOnly) {
    query += ' AND read_at IS NULL';
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(pagination.limit, offset);

  const [rows] = await pool.query(query, params);

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND deleted_at IS NULL';
  const countParams = [userId];
  if (unreadOnly) {
    countQuery += ' AND read_at IS NULL';
  }
  const [countRows] = await pool.query(countQuery, countParams);
  const total = countRows[0].total;

  const unreadCount = await notificationService.getUnreadCount(userId);

  const normalizedRows = rows.map(r => ({
    id: r.id,
    title: r.title,
    body: r.body,
    type: r.type,
    sourceType: r.source_type,
    sourceId: r.source_id,
    actionType: r.action_type,
    actionPayload: safeParseActionPayload(r.action_payload),
    read: !!r.read_at,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));

  res.status(200).json({
    data: normalizedRows,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    },
    unreadCount
  });
};

const getUnreadCount = async (req, res) => {
  const userId = req.user.id;
  const unreadCount = await notificationService.getUnreadCount(userId);
  res.json({ unreadCount });
};

const markAllRead = async (req, res) => {
  const userId = req.user.id;
  await notificationService.markAllRead(userId);
  await emitUnreadCountUpdated(userId);
  res.json({ success: true, message: 'All notifications marked as read' });
};

const markRead = async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  const [result] = await pool.query(
    'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL AND deleted_at IS NULL',
    [notificationId, userId]
  );

  if (result.affectedRows === 0) {
    // Might be already read, or not found/deleted
    const [check] = await pool.query('SELECT id, read_at FROM notifications WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [notificationId, userId]);
    if (check.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
  }

  await emitUnreadCountUpdated(userId);
  res.json({ success: true, message: 'Notification marked as read' });
};

const deleteNotification = async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  const result = await notificationService.softDeleteNotification(userId, notificationId);
  if (result.affectedRows === 0) {
    const [check] = await pool.query('SELECT id FROM notifications WHERE id = ? AND user_id = ?', [notificationId, userId]);
    if (check.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
  }

  await emitUnreadCountUpdated(userId);
  res.json({ success: true, message: 'Notification deleted' });
};

const clearAllNotifications = async (req, res) => {
  const userId = req.user.id;
  const result = await notificationService.softDeleteAllNotifications(userId);
  await emitUnreadCountUpdated(userId);
  res.json({
    success: true,
    message: 'All notifications cleared',
    deletedCount: result?.affectedRows || 0,
  });
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  deleteNotification,
  clearAllNotifications
};
