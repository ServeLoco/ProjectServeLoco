const { pool } = require('../db/mysql');
const { hashPassword, comparePassword, signCustomerToken } = require('../utils/auth');
const adminInbox = require('../utils/adminNotifications');

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

  // Admin inbox — fire-and-forget notification on new customer signup.
  adminInbox.createAdminNotification({
    type: adminInbox.TYPES.NEW_CUSTOMER,
    title: 'New customer signed up',
    body: `${name || phone} just created an account`,
    relatedUrl: `/customers?id=${userId}`,
    relatedId: String(userId),
  });

  res.status(201).json({
    message: 'Registration successful',
    token,
    user: { id: userId, name, phone, address, whatsapp_number, trusted: 0, blocked: 0 }
  });
};

const login = async (req, res) => {
  const { phone, password } = req.validatedData;

  const [rows] = await pool.query('SELECT id, name, phone, whatsapp_number, address, trusted, blocked, created_at, password_hash FROM users WHERE phone = ?', [phone]);
  if (rows.length === 0) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid phone or password' });
  }

  const row = rows[0];
  const passwordHash = row.password_hash || row.password;
  const isMatch = await comparePassword(password, passwordHash);
  if (!isMatch) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid phone or password' });
  }

  if (row.blocked) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
  }

  const token = signCustomerToken(row.id);
  const user = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    whatsapp_number: row.whatsapp_number,
    address: row.address,
    trusted: row.trusted,
    blocked: row.blocked,
    created_at: row.created_at
  };

  res.status(200).json({
    message: 'Login successful',
    token,
    user
  });
};

const me = async (req, res) => {
  const userId = req.user.id;

  const [rows] = await pool.query(
    'SELECT id, name, phone, whatsapp_number, address, trusted, blocked, deletion_requested_at, created_at FROM users WHERE id = ?',
    [userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
  }

  const user = rows[0];

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

  const [resetResult] = await pool.query(
    'INSERT INTO password_reset_requests (user_id, password_hash) VALUES (?, ?)',
    [userId, hashedPassword]
  );

  // Admin inbox — notify all admins a password reset is awaiting approval.
  adminInbox.createAdminNotification({
    type: adminInbox.TYPES.PASSWORD_RESET_REQUESTED,
    title: 'Password reset requested',
    body: `Customer ID ${userId} (${phone}) requested a password reset and is awaiting approval`,
    relatedUrl: `/customers`,
    relatedId: String(resetResult.insertId),
  });

  res.status(202).json(response);
};

// Soft-delete the customer account: wipe PII, block further logins, and
// reject any pending password reset requests. Hard purge happens via a
// Soft-delete with a 30-day grace period. Verifies the user's current password,
// marks the account for deletion, and signs the user out. A separate cron
// (see server.js) hard-deletes accounts where deletion_requested_at is older
// than 30 days. The `requireCustomer` middleware also blocks any token
// whose user has blocked=1, so any in-flight JWT becomes unusable once we
// flip the flag — but we deliberately do NOT flip blocked=1 here, so the
// user can keep using the app during the grace period to change their mind.
const DELETION_GRACE_DAYS = 30;

const requestAccountDeletion = async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body || {};

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Password is required' });
  }

  const [rows] = await pool.query(
    'SELECT id, password_hash, deletion_requested_at FROM users WHERE id = ?',
    [userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Account not found' });
  }

  // Verify the entered password against the stored hash.
  const ok = await comparePassword(password, rows[0].password_hash || '');
  if (!ok) {
    return res.status(401).json({ code: 'INVALID_PASSWORD', message: 'Incorrect password' });
  }

  // Allow re-confirmation — overwrites the previous timestamp (grace period
  // restarts from "now"). The user explicitly asked for 30 days, so we honour
  // that even if they previously scheduled then cancelled.
  await pool.query(
    'UPDATE users SET deletion_requested_at = NOW() WHERE id = ?',
    [userId]
  );

  res.status(200).json({
    success: true,
    message: `Your account will be deleted automatically in ${DELETION_GRACE_DAYS} days. You can cancel anytime from your Profile.`,
    graceDays: DELETION_GRACE_DAYS,
    deletionRequestedAt: new Date().toISOString(),
  });
};

// Cancel a previously scheduled deletion (used by the "Cancel deletion" UI).
const cancelAccountDeletion = async (req, res) => {
  const userId = req.user.id;
  await pool.query(
    'UPDATE users SET deletion_requested_at = NULL, deletion_reason = NULL WHERE id = ?',
    [userId]
  );
  res.status(200).json({ success: true, message: 'Account deletion cancelled.' });
};

const { Expo } = require('expo-server-sdk');

const registerPushToken = async (req, res) => {
  const userId = req.user.id;
  const token = req.body?.push_token || req.body?.pushToken;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'push_token is required' });
  }

  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid Expo push token format' });
  }

  await pool.query('UPDATE users SET push_token = ? WHERE id = ?', [token, userId]);
  res.json({ success: true });
};

module.exports = {
  register,
  login,
  me,
  updateProfile,
  requestPasswordReset,
  requestAccountDeletion,
  cancelAccountDeletion,
  registerPushToken,
};
