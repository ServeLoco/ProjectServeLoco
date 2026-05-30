const fs = require('fs');
const config = require('../config/env');

const isEnabled = (value) => ['1', 'true', 'require', 'required'].includes(String(value || '').trim().toLowerCase());

const getMysqlSslOptions = () => {
  if (!isEnabled(config.MYSQL_SSL)) {
    return undefined;
  }

  const ssl = {};

  if (config.MYSQL_SSL_CA_PATH) {
    ssl.ca = fs.readFileSync(config.MYSQL_SSL_CA_PATH);
    ssl.rejectUnauthorized = true;
    return ssl;
  }

  // Matches Azure's ssl-mode=require behavior: encrypt the connection even
  // when no CA file has been configured locally.
  ssl.rejectUnauthorized = false;
  return ssl;
};

module.exports = {
  getMysqlSslOptions,
};
