const mysql = require('mysql2/promise');
const config = require('../config/env');
const { getMysqlSslOptions } = require('./mysqlSsl');
const logger = require('../utils/logger');

// Pool size is env-tunable. Default 30 handles burst of concurrent requests
// without forcing them to queue. Timeouts prevent zombie connections.
const poolSize = Number.parseInt(config.MYSQL_POOL_SIZE, 10) > 0
  ? Number.parseInt(config.MYSQL_POOL_SIZE, 10)
  : 30;

const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  database: config.MYSQL_DATABASE,
  ssl: getMysqlSslOptions(),
  // Without this, mysql2 defaults to the host OS's local TZ ('local') for
  // DATETIME read/write — same code stores/reads a different wall-clock
  // depending on the machine it runs on (dev box vs prod container), which
  // is exactly what caused created_at values to be ambiguous.
  //
  // This MUST match the MySQL server's own session time_zone (not the IST
  // business display zone — see config.RIDER_TODAY_TZ, used separately for
  // CONVERT_TZ target in report/order queries). Re-confirmed 2026-09-15 via
  // SELECT @@global.time_zone on the Azure server: '+00:00' (UTC), dev boxes are
  // typically SYSTEM = IST — hence the per-env override. If this value
  // disagrees with the real server, every timestamp the API returns is
  // silently shifted by the difference.
  timezone: config.MYSQL_SESSION_TZ,
  waitForConnections: true,
  connectionLimit: poolSize,
  queueLimit: 0,
  connectTimeout: 10_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000,
});

// Opens a transaction at READ COMMITTED rather than InnoDB's default
// REPEATABLE READ and returns the connection holding it. Callers release it
// exactly as they would one from pool.getConnection().
//
// `SET TRANSACTION` with no scope applies to the NEXT transaction on that
// session only, so it cannot follow the connection back into the pool and
// change the isolation level for whoever gets it next. It has to be its own
// statement (mysql2's beginTransaction takes no isolation argument), which is
// the reason this is a helper: it keeps the two statements — and releasing the
// connection if either of them throws — in one place instead of at every call
// site. See createOrder in controllers/orderController.js for why that path
// needs READ COMMITTED.
const beginReadCommitted = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
  } catch (error) {
    connection.release();
    throw error;
  }
  return connection;
};

const checkConnection = async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    logger.error('MySQL Connection Error:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  beginReadCommitted,
  checkConnection
};
