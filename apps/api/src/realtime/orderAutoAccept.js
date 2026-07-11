const { pool } = require('../db/mysql');
const realtimeEvents = require('./orderEvents');
const notificationService = require('../utils/notificationService');
const { notifyShopsForOrder } = require('../utils/shops');

const AUTO_ACCEPT_MS = 120_000;

// In-memory map of orderId → Node Timeout handle. Cleared on cancel/completion.
const timers = new Map();

// Process-wide shutdown flag. Once set, any in-flight timer callback skips
// its DB write (the pool may already be closed during graceful shutdown).
let shuttingDown = false;

// Orders claimed by THIS process via schedule(). The rehydrate path skips
// them so a restart doesn't double-emit admin.order.auto_accepted events.
const claimedOrders = new Set();

/**
 * Schedule an auto-accept for a newly created order. If no admin accepts
 * (or cancels) within AUTO_ACCEPT_MS, the order moves to 'Accepted' and a
 * Socket.IO event is emitted so all admin clients refresh their views.
 */
const schedule = (orderId, orderNumber) => {
  if (!Number.isFinite(orderId)) return;
  cancel(orderId); // ensure no duplicate
  claimedOrders.add(orderId);
  const t = setTimeout(async () => {
    timers.delete(orderId);
    if (shuttingDown) return; // pool may be closed; skip silently

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
        notifyShopsForOrder(order);

        // House-only orders (no shop items) start rider assignment immediately.
        const { startAssignmentIfHouseOnly } = require('../services/riderAssignment');
        startAssignmentIfHouseOnly(order.id).catch((e) =>
          console.error('[rider-assign] house start on auto-accept failed:', e.message)
        );

        // Notify the customer — same path as manual admin accept.
        // Fire-and-forget; the result is passed to emitNotificationCreated
        // so the customer's bell icon and socket update in real-time too.
        notificationService.createOrderNotification({
          userId: order.customer_id,
          order,
          event: 'status_accepted',
        }).then(result =>
          realtimeEvents.emitNotificationCreated(order.customer_id, result)
        ).catch(() => {});

        console.log(`[auto-accept] order #${orderNumber} (id=${orderId}) auto-accepted after ${AUTO_ACCEPT_MS}ms`);
      }
    } catch (e) {
      console.error('[auto-accept] failed for order', orderId, e.message);
    } finally {
      claimedOrders.delete(orderId);
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
  claimedOrders.delete(orderId);
};

const clearAll = () => {
  shuttingDown = true;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
};

/**
 * On API startup, auto-accept any orders that were created more than
 * AUTO_ACCEPT_MS ago and are still Pending. Keeps behaviour consistent
 * across restarts. Skips orders already claimed by this process (their
 * live schedule() will fire in 10s).
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
      if (claimedOrders.has(r.id)) continue; // live timer in this process will handle it
      await pool.query(
        "UPDATE orders SET status = 'Accepted' WHERE id = ? AND status = 'Pending'",
        [r.id]
      );
      const [updated] = await pool.query('SELECT * FROM orders WHERE id = ?', [r.id]);
      const order = updated[0];
      if (order) {
        realtimeEvents.emitOrderAutoAccepted(order);
        notificationService.createOrderNotification({
          userId: order.customer_id,
          order,
          event: 'status_accepted',
        }).then(result =>
          realtimeEvents.emitNotificationCreated(order.customer_id, result)
        ).catch(() => {});
      }
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
