const { pool } = require('../db/mysql');
const { riderShape, syncDeliveryAvailabilityFromRiders } = require('../utils/riders');

// GET /api/rider/me — this rider's profile + online state.
const getMe = async (req, res) => {
  const rider = riderShape(req.rider);
  res.status(200).json({
    rider,
    // Both casings for clients that mirror shop responses.
    isOnline: rider.isOnline,
    is_online: rider.is_online,
  });
};

// PATCH /api/rider/me/online — body { isOnline | is_online: boolean }.
// Sets is_online, refreshes heartbeat when going online, clears when offline,
// then syncs settings.delivery_available from active rider count.
const setOnline = async (req, res) => {
  const raw = req.body.isOnline !== undefined ? req.body.isOnline : req.body.is_online;
  if (typeof raw !== 'boolean') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'isOnline (boolean) is required',
    });
  }

  if (raw) {
    await pool.query(
      'UPDATE riders SET is_online = 1, last_heartbeat_at = NOW() WHERE id = ?',
      [req.rider.id]
    );
  } else {
    await pool.query(
      'UPDATE riders SET is_online = 0, last_heartbeat_at = NULL WHERE id = ?',
      [req.rider.id]
    );
  }

  const [rows] = await pool.query(
    `SELECT id, user_id, display_name, phone, active, is_online, last_heartbeat_at
     FROM riders WHERE id = ?`,
    [req.rider.id]
  );
  req.rider = rows[0];

  // Fire-and-await so the response reflects the new delivery gate; never throws.
  await syncDeliveryAvailabilityFromRiders();

  const rider = riderShape(req.rider);
  res.status(200).json({
    message: 'Rider online status updated',
    rider,
    isOnline: rider.isOnline,
    is_online: rider.is_online,
  });
};

// POST /api/rider/me/heartbeat — keepalive while online. Refreshes last_heartbeat_at.
// If the rider is currently offline, heartbeat alone does not turn them online
// (must use /me/online); returns 400 so clients can re-toggle.
const heartbeat = async (req, res) => {
  if (!req.rider.is_online) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Rider is offline; go online before sending heartbeats',
    });
  }

  await pool.query(
    'UPDATE riders SET last_heartbeat_at = NOW() WHERE id = ? AND is_online = 1',
    [req.rider.id]
  );

  const [rows] = await pool.query(
    `SELECT id, user_id, display_name, phone, active, is_online, last_heartbeat_at
     FROM riders WHERE id = ?`,
    [req.rider.id]
  );
  req.rider = rows[0];

  res.status(200).json({
    message: 'Heartbeat recorded',
    rider: riderShape(req.rider),
  });
};

module.exports = {
  getMe,
  setOnline,
  heartbeat,
};
