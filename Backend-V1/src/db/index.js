const mysqlDB = require('./mysql');
const mongoDB = require('./mongodb');

const initDB = async () => {
  const mysqlOk = await mysqlDB.checkConnection();
  if (!mysqlOk) {
    throw new Error('Failed to connect to MySQL');
  }
  console.log('Connected to MySQL');

  await mongoDB.connect();
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
