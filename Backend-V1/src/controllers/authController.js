const { pool } = require('../db/mysql');
const { hashPassword, comparePassword, signCustomerToken } = require('../utils/auth');

const register = async (req, res) => {
  const { name, phone, password, address, whatsapp_number } = req.validatedData;

  // Check duplicate phone before INSERT to return a clean error
  const [existing] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
  if (existing.length > 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Phone number already registered' });
  }

  const hashedPassword = await hashPassword(password);

  const [result] = await pool.query(
    'INSERT INTO users (name, phone, password_hash, address, whatsapp_number) VALUES (?, ?, ?, ?, ?)',
    [name, phone, hashedPassword, address || null, whatsapp_number || null]
  );

  const userId = result.insertId;
  const token = signCustomerToken(userId);

  res.status(201).json({
    message: 'Registration successful',
    token,
    user: { id: userId, name, phone, address, whatsapp_number, trusted: 0, blocked: 0 }
  });
};

const login = async (req, res) => {
  const { phone, password } = req.validatedData;

  const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
  if (rows.length === 0) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid phone or password' });
  }

  const user = rows[0];
  const passwordHash = user.password_hash || user.password;
  const isMatch = await comparePassword(password, passwordHash);
  if (!isMatch) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid phone or password' });
  }

  if (user.blocked) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
  }

  const token = signCustomerToken(user.id);
  delete user.password_hash; // Do not return hash
  delete user.password;

  res.status(200).json({
    message: 'Login successful',
    token,
    user
  });
};

const me = async (req, res) => {
  const userId = req.user.id;

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const user = rows[0];
  delete user.password_hash;
  delete user.password;

  res.status(200).json({ user });
};

const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { name, address, whatsapp_number } = req.validatedData;

  await pool.query(
    'UPDATE users SET name = ?, address = ?, whatsapp_number = ? WHERE id = ?',
    [name, address, whatsapp_number, userId]
  );

  const [rows] = await pool.query('SELECT id, name, phone, whatsapp_number, address, trusted, blocked FROM users WHERE id = ?', [userId]);

  res.status(200).json({
    message: 'Profile updated successfully',
    user: rows[0]
  });
};

const requestPasswordReset = async (req, res) => {
  const { phone, newPassword } = req.validatedData;
  const [users] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);

  // Return the same success message even if the phone is unknown to avoid account discovery.
  const response = {
    message: 'If the phone number is registered, your password reset request has been sent for admin approval'
  };

  if (users.length === 0) {
    return res.status(202).json(response);
  }

  const userId = users[0].id;
  const hashedPassword = await hashPassword(newPassword);

  await pool.query(
    `UPDATE password_reset_requests
     SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_admin_id = 'system', review_note = 'Replaced by newer request'
     WHERE user_id = ? AND status = 'pending'`,
    [userId]
  );

  await pool.query(
    'INSERT INTO password_reset_requests (user_id, password_hash) VALUES (?, ?)',
    [userId, hashedPassword]
  );

  res.status(202).json(response);
};

module.exports = {
  register,
  login,
  me,
  updateProfile,
  requestPasswordReset
};
