const { pool } = require('../db/mysql');

/**
 * Get all notification templates
 */
const getNotificationTemplates = async (req, res) => {
  const [templates] = await pool.query(`
    SELECT id, event_key, title, body, enabled, created_at, updated_at
    FROM notification_templates
    ORDER BY
      CASE event_key
        WHEN 'order_placed' THEN 1
        WHEN 'status_accepted' THEN 2
        WHEN 'status_preparing' THEN 3
        WHEN 'status_out_for_delivery' THEN 4
        WHEN 'status_delivered' THEN 5
        WHEN 'status_cancelled' THEN 6
        WHEN 'payment_paid' THEN 7
        WHEN 'payment_failed' THEN 8
        WHEN 'payment_refunded' THEN 9
        ELSE 10
      END
  `);

  res.status(200).json({ data: templates });
};

/**
 * Update a notification template
 */
const updateNotificationTemplate = async (req, res) => {
  const { id } = req.params;
  const { title, body, enabled } = req.body;

  if (!title || !body) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Title and body are required'
    });
  }

  const [result] = await pool.query(
    `UPDATE notification_templates
     SET title = ?, body = ?, enabled = ?
     WHERE id = ?`,
    [title, body, enabled !== undefined ? enabled : 1, id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Notification template not found'
    });
  }

  const [updated] = await pool.query(
    'SELECT * FROM notification_templates WHERE id = ?',
    [id]
  );

  res.status(200).json({
    message: 'Notification template updated successfully',
    data: updated[0]
  });
};

/**
 * Reset a notification template to default
 */
const resetNotificationTemplate = async (req, res) => {
  const { id } = req.params;

  const defaults = {
    'order_placed': {
      title: '🎉 Order Confirmed!',
      body: 'Your order has been placed successfully. We\'ll notify you once it\'s accepted.'
    },
    'status_accepted': {
      title: '✅ Order Accepted!',
      body: 'Great news! Your order has been accepted and will be prepared shortly.'
    },
    'status_preparing': {
      title: '👨‍🍳 Preparing Your Order',
      body: 'Your delicious order is being prepared with care. Hang tight!'
    },
    'status_out_for_delivery': {
      title: '🚚 On The Way!',
      body: 'Your order is out for delivery. It will reach you soon!'
    },
    'status_delivered': {
      title: '🎊 Delivered!',
      body: 'Your order has been delivered. Enjoy your meal!'
    },
    'status_cancelled': {
      title: '❌ Order Cancelled',
      body: 'Your order was cancelled. Contact us if you need help.'
    },
    'payment_paid': {
      title: '💰 Payment Received',
      body: 'Your payment has been confirmed. Thank you!'
    },
    'payment_failed': {
      title: '⚠️ Payment Issue',
      body: 'Payment failed. Please try again or contact support.'
    },
    'payment_refunded': {
      title: '💸 Refund Processed',
      body: 'Your payment has been refunded successfully.'
    }
  };

  const [template] = await pool.query(
    'SELECT event_key FROM notification_templates WHERE id = ?',
    [id]
  );

  if (template.length === 0) {
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Notification template not found'
    });
  }

  const eventKey = template[0].event_key;
  const defaultTemplate = defaults[eventKey];

  if (!defaultTemplate) {
    return res.status(400).json({
      code: 'INVALID_REQUEST',
      message: 'No default template available for this event'
    });
  }

  await pool.query(
    `UPDATE notification_templates
     SET title = ?, body = ?, enabled = 1
     WHERE id = ?`,
    [defaultTemplate.title, defaultTemplate.body, id]
  );

  const [updated] = await pool.query(
    'SELECT * FROM notification_templates WHERE id = ?',
    [id]
  );

  res.status(200).json({
    message: 'Notification template reset to default',
    data: updated[0]
  });
};

module.exports = {
  getNotificationTemplates,
  updateNotificationTemplate,
  resetNotificationTemplate
};
