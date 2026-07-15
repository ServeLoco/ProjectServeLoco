/**
 * Native FCM data-only alarm delivery for shop-owner / rider killed-app path.
 *
 * Expo Push data-only messages do not reliably start RNFB headless JS on
 * Android 14. Firebase Admin high-priority data messages do reach
 * setBackgroundMessageHandler, which displays the notifee full-screen alarm.
 *
 * All data values must be strings (FCM requirement).
 */
const { getMessaging } = require('firebase-admin/messaging');
const { initFirebase } = require('../config/firebase');

const isProd = process.env.NODE_ENV === 'production';

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} userId
 * @param {Record<string, string|number|null|undefined>} data
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
const sendFcmDataOnlyToUser = async (pool, userId, data = {}) => {
  try {
    const app = initFirebase();
    if (!app) {
      return { sent: false, reason: 'firebase_uninitialized' };
    }

    const [rows] = await pool.query(
      'SELECT fcm_token FROM users WHERE id = ? AND fcm_token IS NOT NULL AND fcm_token != \'\' LIMIT 1',
      [userId]
    );
    const token = rows[0]?.fcm_token;
    if (!token) {
      return { sent: false, reason: 'no_fcm_token' };
    }

    const stringData = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (v == null) continue;
      stringData[k] = String(v);
    }

    await getMessaging(app).send({
      token,
      data: stringData,
      // No `notification` key → true data-only (JS must display).
      android: {
        priority: 'high',
        ttl: 3600 * 1000,
      },
    });

    if (!isProd) {
      console.log('[fcmAlarm] sent data-only to user=%s keys=%j', userId, Object.keys(stringData));
    }
    return { sent: true };
  } catch (err) {
    const code = err?.errorInfo?.code || err?.code || '';
    // Dead token hygiene
    if (
      code === 'messaging/registration-token-not-registered'
      || code === 'messaging/invalid-registration-token'
    ) {
      try {
        await pool.query('UPDATE users SET fcm_token = NULL WHERE id = ?', [userId]);
      } catch { /* ignore */ }
    }
    console.error('[fcmAlarm] send failed user=%s: %s', userId, err.message);
    return { sent: false, reason: err.message };
  }
};

/**
 * Fan-out data-only FCM to many users. Returns list of userIds that still need
 * an Expo fallback (no token or send failed).
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {number[]} userIds
 * @param {Record<string, string|number|null|undefined>} data
 * @returns {Promise<number[]>} userIds not successfully delivered via FCM
 */
const sendFcmDataOnlyToMany = async (pool, userIds, data = {}) => {
  const remaining = [];
  if (!userIds || userIds.length === 0) return remaining;

  for (const userId of userIds) {
    const result = await sendFcmDataOnlyToUser(pool, userId, data);
    if (!result.sent) remaining.push(userId);
  }
  return remaining;
};

module.exports = {
  sendFcmDataOnlyToUser,
  sendFcmDataOnlyToMany,
};
