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

module.exports = {
  login,
  me,
  getUsers,
  setBlockStatus,
  setTrustStatus
};
