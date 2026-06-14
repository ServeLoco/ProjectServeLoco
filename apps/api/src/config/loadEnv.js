const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
const envDir = path.resolve(__dirname, '..', '..');
const originalEnv = { ...process.env };

const loadEnvFile = (filename, override = false) => {
  const envPath = path.join(envDir, filename);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override });
  }
};

loadEnvFile('.env', false);
loadEnvFile(`.env.${appEnv}`, true);

Object.entries(originalEnv).forEach(([key, value]) => {
  process.env[key] = value;
});

process.env.APP_ENV = process.env.APP_ENV || appEnv;

module.exports = {
  appEnv
};
