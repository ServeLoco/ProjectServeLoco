const mysql = require('mysql2/promise');
const config = require('../config/env');
const { getMysqlSslOptions } = require('./mysqlSsl');

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
  // CONVERT_TZ target in report/order queries). Confirmed 2026-09-10 via
  // SELECT @@session.time_zone: prod = '+00:00' (UTC), dev boxes are
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

const checkConnection = async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL Connection Error:', error.message);
    return false;
  }
};

module.exports = {
  pool,
  checkConnection
};
