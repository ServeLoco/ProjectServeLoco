const app = require('./app');
const config = require('./config/env');
const db = require('./db');
const { closeRealtime, initRealtime } = require('./realtime/socket');
const orderAutoAccept = require('./realtime/orderAutoAccept');

const PORT = config.PORT;

let server;

const startServer = async () => {
  try {
    await db.initDB();

    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });
    initRealtime(server);
    // Auto-accept any orders that were Pending before this restart.
    orderAutoAccept.rehydratePendingOrders().catch(() => {});
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
