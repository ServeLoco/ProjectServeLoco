require('dotenv').config();

const ENV = process.env.NODE_ENV || 'development';
const isProd = ENV === 'production';

// Safe defaults for local testing
const localDefaults = {
  ADMIN_OWNER_ID: '9350238504',
  ADMIN_PASSWORD: 'admin143',
  PORT: '3000',
  CORS_ORIGIN: '*',
  PUBLIC_BASE_URL: 'http://10.0.2.2:3000',
  UPLOAD_DIR: 'uploads',
  MAX_IMAGE_SIZE_MB: '5',
  STATIC_UPLOAD_PATH: '/uploads'
};

const getEnv = (key, fallback) => {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (!isProd && fallback !== undefined) return fallback;
  return undefined;
};

const config = {
  NODE_ENV: ENV,
  PORT: getEnv('PORT', localDefaults.PORT),
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  ADMIN_OWNER_ID: getEnv('ADMIN_OWNER_ID', localDefaults.ADMIN_OWNER_ID),
  ADMIN_PASSWORD: getEnv('ADMIN_PASSWORD', localDefaults.ADMIN_PASSWORD),

  MYSQL_HOST: process.env.MYSQL_HOST,
  MYSQL_PORT: process.env.MYSQL_PORT,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  MYSQL_USER: process.env.MYSQL_USER,
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,

  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DATABASE: process.env.MONGODB_DATABASE,

  CORS_ORIGIN: getEnv('CORS_ORIGIN', localDefaults.CORS_ORIGIN),
  
  PUBLIC_BASE_URL: getEnv('PUBLIC_BASE_URL', localDefaults.PUBLIC_BASE_URL),
  UPLOAD_DIR: getEnv('UPLOAD_DIR', localDefaults.UPLOAD_DIR),
  MAX_IMAGE_SIZE_MB: getEnv('MAX_IMAGE_SIZE_MB', localDefaults.MAX_IMAGE_SIZE_MB),
  STATIC_UPLOAD_PATH: getEnv('STATIC_UPLOAD_PATH', localDefaults.STATIC_UPLOAD_PATH)
};

// Validation
const requiredKeys = [
  'JWT_SECRET',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DATABASE',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MONGODB_URI',
  'MONGODB_DATABASE'
];

const missing = requiredKeys.filter((key) => !config[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// Safety check for JWT in production
if (isProd) {
  if (config.JWT_SECRET === 'your_jwt_secret_here' || config.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET is unsafe for production environments.');
  }
}

module.exports = config;
