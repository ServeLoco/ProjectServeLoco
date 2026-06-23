const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// Brand saffron — rendered as the notification icon accent color on Android.
const BRAND_COLOR = '#FF7A3A';

/**
 * Build a single Expo push message object.
 * All visual extras (color, priority, category) are opt-in via opts.
 */
const buildMessage = (token, { title, body, data = {}, categoryId } = {}) => ({
  to: token,
  sound: 'default',
  title,
  body,
  data,
  channelId: 'serveloco-orders',
  priority: 'high',
  // Android: tints the notification icon with the brand color and marks it as
  // high-priority so it surfaces as a heads-up banner.
  android: { color: BRAND_COLOR },
  // iOS: shows the notification in the default grouped style.
  // categoryId wires up action buttons registered on the client side
  // (e.g. "View Order") so the user can act without opening the app.
  ...(categoryId ? { categoryId } : {}),
});

/**
 * Send a push notification to a single user identified by their DB userId.
 * Looks up their push_token, validates it, and fires via Expo Push API.
 * Completely fire-and-forget — never throws.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} userId
 * @param {{ title: string, body: string, data?: object, categoryId?: string }} opts
 */
const sendPushToUser = async (pool, userId, opts) => {
  try {
    const [rows] = await pool.query(
      'SELECT push_token FROM users WHERE id = ? AND push_token IS NOT NULL LIMIT 1',
      [userId]
    );
    const token = rows[0]?.push_token;
    if (!token || !Expo.isExpoPushToken(token)) return;

    await expo.sendPushNotificationsAsync([buildMessage(token, opts)]);
  } catch (err) {
    console.error('[expoPush] sendPushToUser failed:', err.message);
  }
};

/**
 * Send push notifications to many users in one batched call.
 * Completely fire-and-forget — never throws.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {number[]} userIds
 * @param {{ title: string, body: string, data?: object, categoryId?: string }} opts
 */
const sendPushToMany = async (pool, userIds, opts) => {
  if (!userIds || userIds.length === 0) return;

  try {
    const placeholders = userIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT push_token FROM users WHERE id IN (${placeholders}) AND push_token IS NOT NULL`,
      userIds
    );

    const messages = rows
      .map(r => r.push_token)
      .filter(t => Expo.isExpoPushToken(t))
      .map(token => buildMessage(token, opts));

    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk).catch(err => {
        console.error('[expoPush] chunk send failed:', err.message);
      });
    }
  } catch (err) {
    console.error('[expoPush] sendPushToMany failed:', err.message);
  }
};

module.exports = { sendPushToUser, sendPushToMany };
