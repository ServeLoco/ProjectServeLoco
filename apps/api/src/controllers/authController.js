const { pool } = require('../db/mysql');
const { hashPassword, comparePassword, signCustomerToken, verifyToken } = require('../utils/auth');
const { getFirebaseAuth } = require('../config/firebase');
const adminInbox = require('../utils/adminNotifications');

// Normalize an inbound phone number the same way the Firebase/OTP flow does:
// strip a leading +91, drop non-digits, and keep the trailing 10 digits.
// This keeps the password and OTP auth flows in agreement so the same user
// can't end up with two accounts (one registered as "+919876543210", another
// as "9876543210").
const normalizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10);
};

// Sliding-window token renewal. We refresh whenever the token has used
// more than half of its own lifetime. This auto-adapts to whatever
// JWT_EXPIRES_IN is configured to: a 30d token refreshes after 15d, a 1d
// token refreshes after 12h, etc. That way a misconfigured short expiry
// doesn't silently strand users — the app re-arms the token on every
// /auth/me call inside the second half of its life.
//
// We also keep an absolute floor (24h) so very long-lived tokens still
// get rotated periodically and don't ride out their entire lifetime
// without ever passing through the server.
const TOKEN_REFRESH_FLOOR_SECONDS = 24 * 60 * 60;

const register = async (req, res) => {
  const { name, password, address, whatsapp_number } = req.validatedData;

  // Normalize the phone BEFORE any DB lookup so "+919876543210" and
  // "9876543210" resolve to the same row. Keep `whatsapp_number` as-is —
  // it's out of scope for this normalization and the schema stores it
  // verbatim.
  const phone = normalizePhone(req.validatedData.phone);
  if (!phone || phone.length !== 10) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid phone number' });
  }

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
  const { password } = req.validatedData;

  // Normalize the phone so "+919876543210" and "9876543210" both find the
  // same account. Match the OTP flow's normalization exactly.
  const phone = normalizePhone(req.validatedData.phone);
  if (!phone || phone.length !== 10) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid phone number' });
  }

  const [rows] = await pool.query('SELECT id, name, phone, whatsapp_number, address, trusted, blocked, created_at, password_hash FROM users WHERE phone = ?', [phone]);
  if (rows.length === 0) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid phone or password' });
  }

  const row = rows[0];
  const passwordHash = row.password_hash || row.password;

  // OTP-only users have no password_hash — password login is not available for them.
  if (!passwordHash) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid phone or password' });
  }

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

  // Sliding token refresh — if the current JWT is past the midpoint of
  // its own lifetime (or within the absolute floor of expiry), issue a
  // fresh one so the client can silently renew without re-login. The
  // midpoint rule makes the refresh window scale with whatever
  // JWT_EXPIRES_IN is set to in production.
  const response = { user };
  try {
    const authHeader = req.headers.authorization || '';
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (rawToken) {
      const decoded = verifyToken(rawToken);
      const nowSec = Math.floor(Date.now() / 1000);
      const exp = decoded.exp || 0;
      const iat = decoded.iat || 0;
      const remaining = exp - nowSec;
      const lifetime = exp - iat;
      // Refresh when:
      //   (a) we're past the midpoint of this token's lifetime, OR
      //   (b) less than TOKEN_REFRESH_FLOOR_SECONDS remain.
      // The `remaining > 0` guard skips already-dead tokens (middleware
      // would have rejected them, but defensive).
      const pastMidpoint = lifetime > 0 && remaining < lifetime / 2;
      const nearFloor = remaining < TOKEN_REFRESH_FLOOR_SECONDS;
      if (remaining > 0 && (pastMidpoint || nearFloor)) {
        response.token = signCustomerToken(userId);
      }
    }
  } catch (_) {
    // Token is still valid (middleware already checked), but if decode fails
    // here for any reason just skip the refresh — not critical.
  }

  res.status(200).json(response);
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
  const { newPassword } = req.validatedData;

  // Return the same success message even if the phone is unknown to avoid account discovery.
  const response = {
    message: 'If the phone number is registered, your password reset request has been sent for admin approval'
  };

  // Normalize the phone so "+919876543210" and "9876543210" find the same
  // account. If normalization fails (e.g. too few digits), still return
  // the same 202 success message — leaking "invalid phone" would let an
  // attacker enumerate valid phone numbers.
  const phone = normalizePhone(req.validatedData.phone);
  if (!phone || phone.length !== 10) {
    return res.status(202).json(response);
  }

  const [users] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);

  if (users.length === 0) {
    return res.status(202).json(response);
  }

  const userId = users[0].id;
  const hashedPassword = await hashPassword(newPassword);

  // Cap pending requests: if one is already awaiting review, refuse a new one.
  const [pendingRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM password_reset_requests WHERE user_id = ? AND status = 'pending'",
    [userId]
  );
  if (pendingRows[0].cnt >= 1) {
    return res.status(429).json({ code: 'TOO_MANY_REQUESTS', message: 'A reset request for this number is already pending. Please wait for it to be reviewed.' });
  }

  await pool.query(
    `UPDATE password_reset_requests
     SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_admin_id = 'system', review_note = 'Replaced by newer request'
     WHERE user_id = ? AND status = 'pending'`,
    [userId]
  );

  const [resetResult] = await pool.query(
    'INSERT INTO password_reset_requests (user_id, password_hash, requester_ip) VALUES (?, ?, ?)',
    [userId, hashedPassword, req.ip || null]
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

  const [rows] = await pool.query(
    'SELECT id, password_hash, firebase_uid, deletion_requested_at FROM users WHERE id = ?',
    [userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Account not found' });
  }

  const user = rows[0];

  // Firebase (OTP-only) users have no password_hash — skip password check.
  // Password-based users must still verify their password.
  if (user.password_hash) {
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Password is required' });
    }
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ code: 'INVALID_PASSWORD', message: 'Incorrect password' });
    }
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

  // Detach this token from any OTHER account first. On a shared device the
  // previous user's row can still hold the same Expo token — without this,
  // they would keep receiving the new user's order notifications.
  await pool.query('UPDATE users SET push_token = NULL WHERE push_token = ? AND id != ?', [token, userId]);
  await pool.query('UPDATE users SET push_token = ? WHERE id = ?', [token, userId]);
  res.json({ success: true });
};

// Customer logout — only clears the push token so this device stops
// receiving the account's notifications. The JWT itself stays valid until
// expiry (no revocation store — out of scope, see plans/bugs.md TASK 4).
const logout = async (req, res) => {
  const userId = req.user.id;
  await pool.query('UPDATE users SET push_token = NULL WHERE id = ?', [userId]);
  res.status(200).json({ data: { ok: true } });
};

/**
 * Firebase Phone Auth — verify the Firebase ID token sent by the client
 * after the user completes OTP verification on the client side.
 *
 * Flow:
 *   1. Client uses Firebase SDK to send OTP, user enters 6-digit code.
 *   2. Firebase verifies code → client gets a Firebase ID token.
 *   3. Client POSTs { idToken, name? } to this endpoint.
 *   4. Backend verifies idToken with Firebase Admin SDK.
 *   5. Backend finds user by phone or creates a new one (signup).
 *   6. Backend issues its own JWT.
 *
 * For login:  POST /auth/firebase-verify  { idToken }
 * For signup: POST /auth/firebase-verify  { idToken, name }
 */
const verifyFirebaseToken = async (req, res) => {
  const { idToken, name } = req.body || {};

  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Firebase ID token is required' });
  }

  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Firebase is not configured on this server' });
  }

  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(idToken);
  } catch (err) {
    console.error('[firebase] verifyIdToken error:', err.code || err.message);
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired Firebase token' });
  }

  // Extract the phone number from the verified token.
  const phone = decoded.phone_number;
  if (!phone) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Firebase token does not contain a phone number' });
  }

  // Only Indian (+91) phone numbers are supported. Reject anything else
  // before we touch the database — including +1 (US), +44 (UK), etc.
  if (!phone.startsWith('+91')) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Only Indian phone numbers (+91) are supported' });
  }

  const firebaseUid = decoded.uid;

  // Normalize phone: strip +91 prefix if present, keep last 10 digits.
  const normalizedPhone = phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10);

  if (normalizedPhone.length !== 10) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid phone number in Firebase token' });
  }

  // Look up user by phone.
  const [existing] = await pool.query(
    'SELECT id, name, phone, whatsapp_number, address, trusted, blocked, firebase_uid, created_at FROM users WHERE phone = ?',
    [normalizedPhone]
  );

  let user;
  let isNewUser = false;

  if (existing.length > 0) {
    // Existing user — login flow.
    user = existing[0];

    if (user.blocked) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
    }

    // Link Firebase UID if not already linked.
    if (!user.firebase_uid) {
      await pool.query('UPDATE users SET firebase_uid = ? WHERE id = ?', [firebaseUid, user.id]);
    }
  } else {
    // New user — signup flow. Name is required for new users.
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        code: 'NAME_REQUIRED',
        message: 'Name is required for new users',
        isNewUser: true,
      });
    }

    const trimmedName = name.trim();
    let userId;
    try {
      const [result] = await pool.query(
        'INSERT INTO users (name, phone, firebase_uid) VALUES (?, ?, ?)',
        [trimmedName, normalizedPhone, firebaseUid]
      );
      userId = result.insertId;
    } catch (insertErr) {
      // ER_DUP_ENTRY (MySQL errno 1062) can happen when two simultaneous
      // OTP verifies for the same new phone race past the SELECT above.
      // Re-query the existing user and continue the login flow instead of
      // leaking the raw SQL error to the client.
      const isDuplicate =
        insertErr &&
        (insertErr.code === 'ER_DUP_ENTRY' || insertErr.errno === 1062);
      if (!isDuplicate) throw insertErr;

      const [raceWinner] = await pool.query(
        'SELECT id, name, phone, whatsapp_number, address, trusted, blocked, firebase_uid, created_at FROM users WHERE phone = ?',
        [normalizedPhone]
      );
      // Vanishingly unlikely (row deleted between the INSERT failure and the
      // re-SELECT), but don't leak the raw MySQL error if it does happen.
      if (raceWinner.length === 0) {
        console.error('[auth] ER_DUP_ENTRY but row vanished on re-query:', insertErr.code || insertErr.message);
        return res.status(409).json({ code: 'CONFLICT', message: 'Account state changed during request. Please try again.' });
      }

      const existingUser = raceWinner[0];
      if (existingUser.blocked) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
      }
      if (!existingUser.firebase_uid) {
        await pool.query('UPDATE users SET firebase_uid = ? WHERE id = ?', [firebaseUid, existingUser.id]);
      }

      // Issue the session inline and return — we don't fall through to the
      // new-user branch below since that would re-insert or fire a duplicate
      // admin notification.
      const raceToken = signCustomerToken(existingUser.id);
      return res.status(200).json({
        message: 'Login successful',
        token: raceToken,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          phone: existingUser.phone,
          whatsapp_number: existingUser.whatsapp_number,
          address: existingUser.address,
          trusted: existingUser.trusted,
          blocked: existingUser.blocked,
          created_at: existingUser.created_at,
        },
      });
    }
    isNewUser = true;

    // Admin inbox — fire-and-forget notification on new customer signup.
    adminInbox.createAdminNotification({
      type: adminInbox.TYPES.NEW_CUSTOMER,
      title: 'New customer signed up',
      body: `${trimmedName} (${normalizedPhone}) just created an account via OTP`,
      relatedUrl: `/customers?id=${userId}`,
      relatedId: String(userId),
    });

    user = {
      id: userId,
      name: trimmedName,
      phone: normalizedPhone,
      whatsapp_number: null,
      address: null,
      trusted: 0,
      blocked: 0,
      created_at: new Date(),
    };
  }

  const token = signCustomerToken(user.id);

  res.status(isNewUser ? 201 : 200).json({
    message: isNewUser ? 'Registration successful' : 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      whatsapp_number: user.whatsapp_number,
      address: user.address,
      trusted: user.trusted,
      blocked: user.blocked,
      created_at: user.created_at,
    },
  });
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
  logout,
  verifyFirebaseToken,
};
