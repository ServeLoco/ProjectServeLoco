const { pool } = require('../db/mysql');

// Same convention as authController's normalizedPhone: strip +91, strip
// non-digits, keep last 10 — so mobile_admins.phone always matches users.phone.
const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/^\+91/, '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? digits : null;
};

const mapMobileAdminRow = (row) => ({
  id: row.id,
  phone: row.phone,
  displayName: row.display_name,
  display_name: row.display_name,
  userId: row.user_id,
  user_id: row.user_id,
  userName: row.user_name || null,
  user_name: row.user_name || null,
  active: Boolean(row.active),
  createdAt: row.created_at,
  created_at: row.created_at,
});

/**
 * Returns the ACTIVE mobile admin row linked to this user, or null.
 * Mirrors getShopForUser / getRiderForUser.
 */
const getMobileAdminForUser = async (userId) => {
  if (!userId) return null;
  try {
    const [rows] = await pool.query(
      `SELECT id, phone, display_name, user_id, active, created_at
       FROM mobile_admins
       WHERE user_id = ? AND active = 1
       LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) return null;
    return mapMobileAdminRow(rows[0]);
  } catch (e) {
    // Table missing mid-migrate / old DB — never break /auth/me for customers.
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return null;
    }
    throw e;
  }
};

/**
 * True if this phone (normalized 10-digit) is an active mobile admin.
 * Used by shop/rider create+update to enforce one-phone-one-role symmetrically.
 */
const isActiveMobileAdminPhone = async (phone) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const [rows] = await pool.query(
    'SELECT id FROM mobile_admins WHERE phone = ? AND active = 1 LIMIT 1',
    [normalized]
  );
  return rows.length > 0;
};

module.exports = {
  normalizePhone,
  mapMobileAdminRow,
  getMobileAdminForUser,
  isActiveMobileAdminPhone,
};
