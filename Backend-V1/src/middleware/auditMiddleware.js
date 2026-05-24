const { getDb } = require('../db/mongodb');

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
      // Fire and forget
      db.collection('audit_logs').insertOne(logEntry).catch(err => {
        console.error('Failed to write audit log:', err);
      });
    } catch (err) {
      console.error('Audit log setup error:', err);
    }

    return res.send(data);
  };

  next();
};

module.exports = { auditLog };
