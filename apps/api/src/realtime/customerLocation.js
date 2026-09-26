// Where a customer's phone is right now, from the pin the app sends over its
// socket — on every (re)connect in the handshake, and as 'location:update'
// when the pin moves. The server resolves it to an area + zone itself (the
// client never asserts its area, §2.3); socket.js uses the answer for the
// customer's broadcast room and live presence.
//
// Only the resolved area/zone ids are kept on the user row. The coordinates
// themselves go no further than the session's analytics doc, rounded to about
// 100 m (the heat map's resolution), and expire with it.

const { pool } = require('../db/mysql');
const { resolveAreaForPoint } = require('../utils/areaScope');

// 3 decimals: ~110 m of latitude, ~100 m of longitude at Indian latitudes.
const LOCATION_DECIMALS = 3;
const roundCoord = (value) => {
  const factor = 10 ** LOCATION_DECIMALS;
  return Math.round(Number(value) * factor) / factor;
};

const isBlank = (value) => value === undefined || value === null || value === '';

/** { lat, lng } from latitude/longitude (or lat/lng) fields, or null. */
const parsePin = (source) => {
  if (!source || typeof source !== 'object') return null;
  const rawLat = source.latitude !== undefined ? source.latitude : source.lat;
  const rawLng = source.longitude !== undefined ? source.longitude : source.lng;
  // Number(null) === 0 is finite: a missing pin must not read as (0, 0).
  if (isBlank(rawLat) || isBlank(rawLng)) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

/**
 * @returns {Promise<{areaId:number|null, zoneId:number|null, loc:{lat:number,lng:number}}>}
 *   areaId/zoneId null when the pin is outside every zone of every area.
 */
const resolveCustomerLocation = async (pin) => {
  const resolved = await resolveAreaForPoint(pin.lat, pin.lng);
  return {
    areaId: resolved ? resolved.areaId : null,
    zoneId: resolved ? resolved.zoneId : null,
    loc: { lat: roundCoord(pin.lat), lng: roundCoord(pin.lng) },
  };
};

// One UPDATE per real change, not per reconnect: a phone on a flaky network
// reconnects every few seconds, always from the same place. An unchanged
// area/zone is only re-stamped after REFRESH_MS, so location_seen_at stays
// roughly current for "who is in this area now" without a write per connect.
// Per-process memory; a restart just costs one extra write per user.
const REFRESH_MS = 30 * 60 * 1000;
const MAX_TRACKED_USERS = 50000;
const lastSaved = new Map(); // userId -> { areaId, zoneId, at }

const saveCustomerLocation = async (userId, areaId, zoneId) => {
  if (!userId) return false;
  const now = Date.now();
  const prev = lastSaved.get(userId);
  if (prev && prev.areaId === areaId && prev.zoneId === zoneId && now - prev.at < REFRESH_MS) {
    return false;
  }
  // Map keeps insertion order: re-inserting moves this user to the newest end,
  // so the size cap below always drops the least recently seen user.
  lastSaved.delete(userId);
  lastSaved.set(userId, { areaId, zoneId, at: now });
  if (lastSaved.size > MAX_TRACKED_USERS) lastSaved.delete(lastSaved.keys().next().value);
  await pool.query(
    'UPDATE users SET current_area_id = ?, current_zone_id = ?, location_seen_at = NOW() WHERE id = ?',
    [areaId, zoneId, userId]
  );
  return true;
};

const _resetForTests = () => lastSaved.clear();

module.exports = {
  parsePin,
  roundCoord,
  resolveCustomerLocation,
  saveCustomerLocation,
  _resetForTests,
};
