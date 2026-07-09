const mysqlDB = require('./mysql');
const mongoDB = require('./mongodb');
const { ensureAnalyticsIndexes } = require('../services/analytics/collections');

const initDB = async () => {
  const mysqlOk = await mysqlDB.checkConnection();
  if (!mysqlOk) {
    throw new Error('Failed to connect to MySQL');
  }
  console.log('Connected to MySQL');

  await mongoDB.connect();

  // Create analytics collection indexes once at startup. Index failure must NOT
  // crash startup (Rule 7) — analytics is additive; the app/API behave exactly
  // as today if Mongo is degraded.
  try {
    await ensureAnalyticsIndexes(mongoDB.getDb());
    console.log('Analytics indexes ensured');
  } catch (error) {
    console.error('[analytics] ensureAnalyticsIndexes failed:', error.message);
  }
};

const closeDB = async () => {
  await mysqlDB.pool.end();
  console.log('MySQL pool closed');
  
  await mongoDB.close();
};

const checkHealth = async () => {
  const mysqlHealth = await mysqlDB.checkConnection();
  const mongoHealth = await mongoDB.checkConnection();
  return {
    mysql: mysqlHealth ? 'ok' : 'error',
    mongodb: mongoHealth ? 'ok' : 'error'
  };
};

module.exports = {
  initDB,
  closeDB,
  checkHealth,
  mysql: mysqlDB.pool,
  mongo: mongoDB
};
