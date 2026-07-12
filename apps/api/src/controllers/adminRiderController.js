const { pool } = require('../db/mysql');
const { syncDeliveryAvailabilityFromRiders, RIDER_HEARTBEAT_TTL_SEC } = require('../utils/riders');
const { isActiveMobileAdminPhone } = require('../utils/mobileAdmins');

const mapRiderRow = (row) => {
  const isOnline = Boolean(row.is_online);
  const hb = row.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : 0;
  const heartbeatFresh = hb > 0 && (Date.now() - hb) < RIDER_HEARTBEAT_TTL_SEC * 1000;
  return {
    id: row.id,
    userId: row.user_id,
    user_id: row.user_id,
    displayName: row.display_name,
    display_name: row.display_name,
    phone: row.phone || row.user_phone || null,
    userPhone: row.user_phone || null,
    user_phone: row.user_phone || null,
    userName: row.user_name || null,
    user_name: row.user_name || null,
    active: Boolean(row.active),
    isOnline,
    is_online: isOnline,
    lastHeartbeatAt: row.last_heartbeat_at || null,
    last_heartbeat_at: row.last_heartbeat_at || null,
    heartbeatFresh,
    heartbeat_fresh: heartbeatFresh,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
};

// GET /api/admin/riders
const listRiders = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, u.name AS user_name, u.phone AS user_phone
     FROM riders r
     JOIN users u ON u.id = r.user_id
     ORDER BY r.id ASC`
  );
  res.status(200).json({ riders: rows.map(mapRiderRow) });
};

// POST /api/admin/riders — body { phone, displayName? } or { userId, displayName? }
const createRider = async (req, res) => {
  const { phone, userId, displayName, display_name } = req.body || {};
  let uid = userId != null ? Number(userId) : null;
  let userRow = null;

  if (uid) {
    const [rows] = await pool.query('SELECT id, name, phone FROM users WHERE id = ?', [uid]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'User not found' });
    }
    userRow = rows[0];
  } else if (phone && String(phone).trim()) {
    const p = String(phone).trim();
    const [rows] = await pool.query('SELECT id, name, phone FROM users WHERE phone = ?', [p]);
    if (rows.length === 0) {
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'No user with that phone. Ask them to log in to the app once (OTP), then create the rider.',
      });
    }
    userRow = rows[0];
    uid = userRow.id;
  } else {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'phone or userId is required',
    });
  }

  // D2: cannot be shop owner
  const [shops] = await pool.query(
    'SELECT id FROM shops WHERE owner_user_id = ? AND active = 1 LIMIT 1',
    [uid]
  );
  if (shops.length > 0) {
    return res.status(409).json({
      code: 'ROLE_CONFLICT',
      message: 'That user already owns a shop. One phone can be shop owner OR rider, not both.',
    });
  }

  // Symmetric with admin's own exclusivity check (mobileAdminController).
  if (userRow.phone && await isActiveMobileAdminPhone(userRow.phone)) {
    return res.status(409).json({
      code: 'ROLE_CONFLICT',
      message: 'That phone is already assigned as a mobile admin. Remove or deactivate that role first.',
    });
  }

  const [existing] = await pool.query('SELECT id FROM riders WHERE user_id = ? LIMIT 1', [uid]);
  if (existing.length > 0) {
    return res.status(409).json({
      code: 'ALREADY_RIDER',
      message: 'That user is already a rider.',
    });
  }

  const name = String(displayName || display_name || userRow.name || 'Rider').trim() || 'Rider';
  let result;
  try {
    [result] = await pool.query(
      `INSERT INTO riders (user_id, display_name, phone, active, is_online)
       VALUES (?, ?, ?, 1, 0)`,
      [uid, name, userRow.phone || null]
    );
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 'ALREADY_RIDER', message: 'That user is already a rider.' });
    }
    throw e;
  }

  const [rows] = await pool.query(
    `SELECT r.*, u.name AS user_name, u.phone AS user_phone
     FROM riders r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    [result.insertId]
  );
  res.status(201).json({ rider: mapRiderRow(rows[0]) });
};

// PATCH /api/admin/riders/:id — active, displayName
const updateRider = async (req, res) => {
  const { id } = req.params;
  const { active, displayName, display_name } = req.body || {};

  const [existing] = await pool.query('SELECT * FROM riders WHERE id = ?', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Rider not found' });
  }

  const sets = [];
  const values = [];
  if (displayName !== undefined || display_name !== undefined) {
    const name = String(displayName ?? display_name ?? '').trim();
    if (!name) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'displayName cannot be empty' });
    }
    sets.push('display_name = ?');
    values.push(name);
  }
  if (active !== undefined) {
    sets.push('active = ?');
    values.push(active ? 1 : 0);
    if (!active) {
      // Force offline when deactivated
      sets.push('is_online = 0');
      sets.push('last_heartbeat_at = NULL');
    }
  }

  if (sets.length > 0) {
    values.push(id);
    await pool.query(`UPDATE riders SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  if (active !== undefined) {
    await syncDeliveryAvailabilityFromRiders();
  }

  const [rows] = await pool.query(
    `SELECT r.*, u.name AS user_name, u.phone AS user_phone
     FROM riders r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    [id]
  );
  const rider = mapRiderRow(rows[0]);

  try {
    const { emitToAdmins } = require('../realtime/socket');
    emitToAdmins('admin.rider.updated', {
      ...rider,
      reason: active !== undefined ? (active ? 'activated' : 'deactivated') : 'updated',
    });
  } catch (_) { /* best-effort */ }

  res.status(200).json({ rider, message: 'Rider updated' });
};

module.exports = {
  listRiders,
  createRider,
  updateRider,
};
