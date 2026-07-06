const { verifyToken } = require('../utils/auth');
const { pool } = require('../db/mysql');

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7, authHeader.length);
  }
  return null;
};

const requireCustomer = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication token missing' });
  }

  try {
    const payload = verifyToken(token);
    if (payload.role !== 'customer') {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Forbidden role' });
    }

    const userId = payload.sub || payload.id;

    if (process.env.NODE_ENV !== 'test') {
      const [rows] = await pool.query('SELECT blocked FROM users WHERE id = ?', [userId]);
      if (rows.length === 0) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session is no longer valid. Please log in again.' });
      }
      if (rows[0].blocked) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Your account is blocked' });
      }
    }

    req.user = { id: userId, role: payload.role };
    next();
  } catch (error) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication token missing' });
  }

  try {
    const payload = verifyToken(token);
    if (payload.role !== 'admin') {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Forbidden role' });
    }
    req.admin = { id: payload.sub || payload.id, role: payload.role };
    next();
  } catch (error) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
};

module.exports = {
  requireCustomer,
  requireAdmin
};
