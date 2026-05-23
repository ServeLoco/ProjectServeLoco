const app = require('./app');
const config = require('./config/env');
const db = require('./db');

const PORT = config.PORT;

let server;

const startServer = async () => {
  try {
    await db.initDB();
    
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown helpers
const shutdown = async () => {
  console.log('SIGTERM/SIGINT signal received: closing HTTP server and database connections');
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
      await db.closeDB();
      process.exit(0);
    });
  } else {
    await db.closeDB();
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = server;
