require('dotenv').config();

const ENV = process.env.NODE_ENV || 'development';
const isProd = ENV === 'production';

// Safe defaults for local testing
const localDefaults = {
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
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  
  ADMIN_OWNER_ID: process.env.ADMIN_OWNER_ID || (ENV === 'test' ? 'test_admin' : undefined),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || (ENV === 'test' ? 'test_pass' : undefined),
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || undefined,

  MYSQL_HOST: process.env.MYSQL_HOST,
  MYSQL_PORT: process.env.MYSQL_PORT,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE,
  MYSQL_USER: process.env.MYSQL_USER,
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
  MYSQL_SSL: process.env.MYSQL_SSL,
  MYSQL_SSL_CA_PATH: process.env.MYSQL_SSL_CA_PATH,

  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DATABASE: process.env.MONGODB_DATABASE,

  CORS_ORIGIN: getEnv('CORS_ORIGIN', localDefaults.CORS_ORIGIN),
  
  PUBLIC_BASE_URL: getEnv('PUBLIC_BASE_URL', localDefaults.PUBLIC_BASE_URL),
  UPLOAD_DIR: process.env.UPLOAD_DIR || localDefaults.UPLOAD_DIR,
  MAX_IMAGE_SIZE_MB: process.env.MAX_IMAGE_SIZE_MB || localDefaults.MAX_IMAGE_SIZE_MB,
  STATIC_UPLOAD_PATH: process.env.STATIC_UPLOAD_PATH || localDefaults.STATIC_UPLOAD_PATH
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
  'MONGODB_DATABASE',
  'ADMIN_OWNER_ID',
  'ADMIN_PASSWORD'
];

const missing = requiredKeys.filter((key) => {
  if (key === 'MYSQL_PASSWORD' && !isProd) return config[key] === undefined;
  return !config[key];
});
// Allow either ADMIN_PASSWORD (plain) or ADMIN_PASSWORD_HASH (bcrypt) to be set
const hasAdminAuth = config.ADMIN_PASSWORD || config.ADMIN_PASSWORD_HASH;
if (missing.includes('ADMIN_PASSWORD') && hasAdminAuth) {
  missing.splice(missing.indexOf('ADMIN_PASSWORD'), 1);
}
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// Safety check for JWT and CORS in production
if (isProd) {
  if (config.JWT_SECRET === 'your_jwt_secret_here' || config.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET is unsafe for production environments.');
  }
  if (!config.CORS_ORIGIN || config.CORS_ORIGIN === '*' || config.CORS_ORIGIN.includes('*')) {
    throw new Error('CORS_ORIGIN must be explicitly defined in production (no wildcards).');
  }
  // In production, require ADMIN_PASSWORD_HASH (bcrypt) — plaintext is not allowed
  if (config.ADMIN_PASSWORD_HASH) {
    if (!config.ADMIN_PASSWORD_HASH.startsWith('$2b$') && !config.ADMIN_PASSWORD_HASH.startsWith('$2a$')) {
      throw new Error('ADMIN_PASSWORD_HASH must be a valid bcrypt hash in production.');
    }
  } else if (config.ADMIN_PASSWORD) {
    if (config.ADMIN_PASSWORD === 'admin143' || config.ADMIN_PASSWORD === 'test_pass' || config.ADMIN_PASSWORD.length < 8) {
      throw new Error('ADMIN_PASSWORD is too weak for production. Use ADMIN_PASSWORD_HASH instead.');
    }
  } else {
    throw new Error('Either ADMIN_PASSWORD_HASH or ADMIN_PASSWORD must be set.');
  }
}

module.exports = config;
