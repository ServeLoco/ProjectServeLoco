const { pool } = require('../db/mysql');
const realtimeEvents = require('./orderEvents');

const AUTO_ACCEPT_MS = 10_000;

// In-memory map of orderId → Node Timeout handle. Cleared on cancel/completion.
const timers = new Map();

/**
 * Schedule an auto-accept for a newly created order. If no admin accepts
 * (or cancels) within AUTO_ACCEPT_MS, the order moves to 'Accepted' and a
 * Socket.IO event is emitted so all admin clients refresh their views.
 *
 * The timer is best-effort: if the API restarts, any in-flight timers are
 * lost. On startup, callers can call `rehydratePendingOrders()` to auto-accept
 * any orders that were already past the threshold.
 */
const schedule = (orderId, orderNumber) => {
  if (!Number.isFinite(orderId)) return;
  cancel(orderId); // ensure no duplicate
  const t = setTimeout(async () => {
    timers.delete(orderId);
    try {
      const [rows] = await pool.query(
        'SELECT id, status FROM orders WHERE id = ? AND deleted = 0',
        [orderId]
      );
      if (rows.length === 0) return;
      if (rows[0].status !== 'Pending') return; // admin already acted

      await pool.query(
        "UPDATE orders SET status = 'Accepted' WHERE id = ? AND status = 'Pending'",
        [orderId]
      );
      const [updated] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
      const order = updated[0];
      if (order) {
        realtimeEvents.emitOrderAutoAccepted(order);
        console.log(`[auto-accept] order #${orderNumber} (id=${orderId}) auto-accepted after ${AUTO_ACCEPT_MS}ms`);
      }
    } catch (e) {
      console.error('[auto-accept] failed for order', orderId, e.message);
    }
  }, AUTO_ACCEPT_MS);
  timers.set(orderId, t);
};

const cancel = (orderId) => {
  const t = timers.get(orderId);
  if (t) {
    clearTimeout(t);
    timers.delete(orderId);
  }
};

const clearAll = () => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
};

/**
 * On API startup, auto-accept any orders that were created more than
 * AUTO_ACCEPT_MS ago and are still Pending. Keeps behaviour consistent
 * across restarts.
 */
const rehydratePendingOrders = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM orders
        WHERE status = 'Pending'
          AND created_at < (NOW() - INTERVAL ? SECOND)`,
      [Math.ceil(AUTO_ACCEPT_MS / 1000)]
    );
    for (const r of rows) {
      await pool.query(
        "UPDATE orders SET status = 'Accepted' WHERE id = ? AND status = 'Pending'",
        [r.id]
      );
      const [updated] = await pool.query('SELECT * FROM orders WHERE id = ?', [r.id]);
      const order = updated[0];
      if (order) realtimeEvents.emitOrderAutoAccepted(order);
      console.log(`[auto-accept] rehydrated order id=${r.id}`);
    }
  } catch (e) {
    console.error('[auto-accept] rehydrate failed:', e.message);
  }
};

module.exports = {
  AUTO_ACCEPT_MS,
  schedule,
  cancel,
  clearAll,
  rehydratePendingOrders,
};
