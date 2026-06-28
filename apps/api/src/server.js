const app = require('./app');
const config = require('./config/env');
const db = require('./db');
const { pool } = require('./db/mysql');
const { closeRealtime, initRealtime } = require('./realtime/socket');
const orderAutoAccept = require('./realtime/orderAutoAccept');

const PORT = config.PORT;
let server;

// Hard-delete users whose deletion grace period (30 days) has elapsed.
// Runs once on startup and every 24 hours after that. Cascades to the
// user's orders / addresses / reset requests through the existing FK
// constraints where appropriate. We intentionally delete the reset requests
// (no FK cascade) explicitly first so the user record is the only thing
// holding audit data — otherwise an orphaned reset_request row could survive.
const purgeExpiredDeletions = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM users
        WHERE deletion_requested_at IS NOT NULL
          AND deletion_requested_at < (NOW() - INTERVAL 30 DAY)
          AND blocked = 0`
    );
    if (rows.length === 0) return;
    const ids = rows.map(r => r.id);
    await pool.query('DELETE FROM password_reset_requests WHERE user_id IN (?)', [ids]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [ids]);
    console.log(`[purge-expired-deletions] hard-deleted ${ids.length} user(s) past 30-day grace`);
  } catch (e) {
    console.error('[purge-expired-deletions] failed:', e.message);
  }
};

const startServer = async () => {
  try {
    await db.initDB();

    server = app.listen(PORT, '0.0.0.0', () => {
      // Log the configured JWT lifetime so a short value (e.g. '1d' leaking
      // in from tests) is obvious in the server logs instead of surfacing
      // as users mysteriously getting logged out after a day.
      const jwtExpires = require('./config/env').JWT_EXPIRES_IN;
      console.log(`Server is running on port ${PORT} (JWT_EXPIRES_IN=${jwtExpires})`);
    });
    initRealtime(server);
    // Auto-accept any orders that were Pending before this restart.
    orderAutoAccept.rehydratePendingOrders().catch(() => {});
    // Run the deletion sweep once at startup, then once a day.
    purgeExpiredDeletions().catch(() => {});
    const purgeTimer = setInterval(() => purgeExpiredDeletions().catch(() => {}), 24 * 60 * 60 * 1000);
    purgeTimer.unref();
    global.__purgeTimer = purgeTimer;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown helpers
const shutdown = async () => {
  console.log('SIGTERM/SIGINT signal received: closing HTTP server and database connections');
  orderAutoAccept.clearAll();
  if (global.__purgeTimer) clearInterval(global.__purgeTimer);
  await closeRealtime();

  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
      await db.closeDB();
      process.exit(0);
    });
  } else {
    await closeRealtime();
    await db.closeDB();
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = server;
