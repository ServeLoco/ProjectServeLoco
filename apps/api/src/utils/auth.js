const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const signCustomerToken = (userId) => {
  return jwt.sign(
    { sub: userId, role: 'customer' },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
};

const signAdminToken = (adminId) => {
  return jwt.sign(
    { sub: adminId, role: 'admin' },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, config.JWT_SECRET);
};

module.exports = {
  hashPassword,
  comparePassword,
  signCustomerToken,
  signAdminToken,
  verifyToken
};
