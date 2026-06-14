const mysql = require('mysql2/promise');
const config = require('../config/env');
const { getMysqlSslOptions } = require('./mysqlSsl');

const migrateNotificationTemplates = async () => {
  let connection;
  try {
    const ssl = getMysqlSslOptions();
    connection = await mysql.createConnection({
      host: config.MYSQL_HOST,
      port: config.MYSQL_PORT,
      user: config.MYSQL_USER,
      password: config.MYSQL_PASSWORD,
      database: config.MYSQL_DATABASE,
      ssl,
      multipleStatements: true
    });

    console.log('Connected to MySQL. Running notification templates migration...');

    // Create notification_templates table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_key VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        enabled TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_event_key (event_key)
      );
    `);
    console.log('Notification templates table ready.');

    // Seed default templates
    const defaultTemplates = [
      {
        event_key: 'order_placed',
        title: '🎉 Order Confirmed!',
        body: 'Your order has been placed successfully. We\'ll notify you once it\'s accepted.'
      },
      {
        event_key: 'status_accepted',
        title: '✅ Order Accepted!',
        body: 'Great news! Your order has been accepted and will be prepared shortly.'
      },
      {
        event_key: 'status_preparing',
        title: '👨‍🍳 Preparing Your Order',
        body: 'Your delicious order is being prepared with care. Hang tight!'
      },
      {
        event_key: 'status_out_for_delivery',
        title: '🚚 On The Way!',
        body: 'Your order is out for delivery. It will reach you soon!'
      },
      {
        event_key: 'status_delivered',
        title: '🎊 Delivered!',
        body: 'Your order has been delivered. Enjoy your meal!'
      },
      {
        event_key: 'status_cancelled',
        title: '❌ Order Cancelled',
        body: 'Your order was cancelled. Contact us if you need help.'
      },
      {
        event_key: 'payment_paid',
        title: '💰 Payment Received',
        body: 'Your payment has been confirmed. Thank you!'
      },
      {
        event_key: 'payment_failed',
        title: '⚠️ Payment Issue',
        body: 'Payment failed. Please try again or contact support.'
      },
      {
        event_key: 'payment_refunded',
        title: '💸 Refund Processed',
        body: 'Your payment has been refunded successfully.'
      }
    ];

    for (const template of defaultTemplates) {
      await connection.query(`
        INSERT INTO notification_templates (event_key, title, body)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          body = VALUES(body)
      `, [template.event_key, template.title, template.body]);
    }
    console.log('Default notification templates seeded.');

    console.log('Notification templates migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

if (require.main === module) {
  migrateNotificationTemplates();
}

module.exports = { migrateNotificationTemplates };
