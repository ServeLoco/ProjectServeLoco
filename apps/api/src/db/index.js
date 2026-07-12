const mysqlDB = require('./mysql');
const mongoDB = require('./mongodb');
const { ensureAnalyticsIndexes } = require('../services/analytics/collections');
const { migrate } = require('./migrate');

// Production (Lightsail docker): `npm start` already runs
//   `node src/db/migrate.js && node src/server.js`
// so schema is applied before the process boots. Never re-run migrate inside
// initDB in production — a second-pass failure would process.exit(1) and take
// the live API down even when DBs are healthy.
// Dev: `npm run dev` does not shell-run migrate, so we apply schema here.
const shouldMigrateInInit = () => {
  const appEnv = (process.env.APP_ENV || '').toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  return appEnv !== 'production' && nodeEnv !== 'production';
};

const initDB = async () => {
  const mysqlOk = await mysqlDB.checkConnection();
  if (!mysqlOk) {
    throw new Error('Failed to connect to MySQL');
  }
  console.log('Connected to MySQL');

  if (shouldMigrateInInit()) {
    try {
      await migrate();
    } catch (error) {
      console.error('[db] migrate on startup failed:', error.message);
      throw error;
    }
  }

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
