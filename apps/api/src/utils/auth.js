const jwt = require('jsonwebtoken');
const config = require('../config/env');

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
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h' }
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, config.JWT_SECRET);
};

module.exports = {
  signCustomerToken,
  signAdminToken,
  verifyToken
};
