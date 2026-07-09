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

    const tickets = await expo.sendPushNotificationsAsync([buildMessage(token, opts)]);
    tallyTickets(tickets, 'sendPushToUser');
    await cleanupDeadTokens(pool, tickets, [token]);
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
  const stats = { recipients: userIds?.length || 0, tokensFound: 0, sent: 0, failed: 0 };

  if (!userIds || userIds.length === 0) return stats;

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

    stats.tokensFound = messages.length;

    if (messages.length === 0) {
      console.warn('[expoPush] sendPushToMany: 0 of %d target users have a valid push token — no device pushes sent', userIds.length);
      return stats;
    }

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      let tickets;
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error('[expoPush] chunk send failed:', err.message);
        stats.failed += chunk.length;
        continue;
      }
      const { ok, failed } = tallyTickets(tickets, 'sendPushToMany');
      stats.sent += ok;
      stats.failed += failed;
      await cleanupDeadTokens(pool, tickets, chunk.map(m => m.to));
    }
    return stats;
  } catch (err) {
    console.error('[expoPush] sendPushToMany failed:', err.message);
    return stats;
  }
};

// Log every error ticket (Expo only nulls tokens for DeviceNotRegistered;
// other errors like InvalidCredentials were previously invisible).
const tallyTickets = (tickets, context) => {
  let ok = 0, failed = 0;
  for (const ticket of tickets || []) {
    if (ticket?.status === 'error') {
      failed++;
      console.error('[expoPush] %s ticket error: %s — %s', context, ticket.details?.error || 'unknown', ticket.message || '');
    } else {
      ok++;
    }
  }
  return { ok, failed };
};

/**
 * Inspect Expo push tickets and null out push_tokens for devices that the
 * APNS/FCM layer has marked as `DeviceNotRegistered`. Fire-and-forget safe —
 * any error is logged and swallowed so cleanup can never fail the send.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {Array<{status?: string, details?: {error?: string}}>} tickets
 * @param {string[]} tokens  Same length and order as the messages sent.
 */
const cleanupDeadTokens = async (pool, tickets, tokens) => {
  try {
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
        const token = tokens[i];
        if (token) {
          await pool.query('UPDATE users SET push_token = NULL WHERE push_token = ?', [token]);
        }
      }
    }
  } catch (err) {
    console.error('[expoPush] cleanup failed:', err.message);
  }
};

// How many of userIds can actually receive a device push.
// Never throws; returns null on query failure (callers treat null as "unknown",
// 0 as a definite "no devices" — do not collapse the two).
const countPushEligible = async (pool, userIds) => {
  if (!userIds || userIds.length === 0) return 0;
  try {
    const placeholders = userIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE id IN (${placeholders}) AND push_token IS NOT NULL`,
      userIds
    );
    return Number(rows?.[0]?.cnt ?? 0);
  } catch (err) {
    console.error('[expoPush] countPushEligible failed:', err.message);
    return null;
  }
};

module.exports = { sendPushToUser, sendPushToMany, cleanupDeadTokens, countPushEligible };
