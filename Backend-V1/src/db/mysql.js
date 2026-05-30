const mysql = require('mysql2/promise');
const config = require('../config/env');
const { getMysqlSslOptions } = require('./mysqlSsl');

const pool = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  database: config.MYSQL_DATABASE,
  ssl: getMysqlSslOptions(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
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
