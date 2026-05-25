const { getDb } = require('../db/mongodb');

const logAuditError = (message, error) => {
  if (process.env.AUDIT_LOG_DEBUG === 'true') {
    console.error(message, error);
  }
};

const auditLog = async (req, res, next) => {
  // Capture the original send method to log response status if needed
  const originalSend = res.send;

  res.send = function (data) {
    res.send = originalSend;
    
    // Asynchronously log after response is sent
    const logEntry = {
      adminId: req.admin?.id || 'unknown',
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      timestamp: new Date(),
      ip: req.ip,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : null,
      params: req.params,
      query: req.query
    };

    try {
      const db = getDb();
      const collection = db.collection('audit_logs');
      if (collection?.insertOne) {
        // Fire and forget; audit logging must not block admin actions.
        collection.insertOne(logEntry).catch(err => {
          logAuditError('Failed to write audit log:', err);
        });
      }
    } catch (err) {
      logAuditError('Audit log setup error:', err);
    }

    return res.send(data);
  };

  next();
};

module.exports = { auditLog };
