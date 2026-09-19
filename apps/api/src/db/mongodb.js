const { MongoClient } = require('mongodb');
const config = require('../config/env');
const logger = require('../utils/logger');

let client = null;
let db = null;

const connect = async () => {
  if (!client) {
    try {
      client = new MongoClient(config.MONGODB_URI);
      await client.connect();
      db = client.db(config.MONGODB_DATABASE);
      logger.info('Connected to MongoDB');
    } catch (error) {
      logger.error('MongoDB Connection Error:', error.message);
      throw error;
    }
  }
  return db;
};

const getDb = () => {
  if (!db) {
    throw new Error('MongoDB not connected');
  }
  return db;
};

const close = async () => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
};

const checkConnection = async () => {
  try {
    if (client) {
      await client.db('admin').command({ ping: 1 });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('MongoDB Ping Error:', error.message);
    return false;
  }
};

module.exports = {
  connect,
  getDb,
  close,
  checkConnection
};
