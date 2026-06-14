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
