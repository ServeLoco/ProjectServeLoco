require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');
const config = require('../config/env');

const runMigration = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.MYSQL_HOST,
      port: config.MYSQL_PORT,
      user: config.MYSQL_USER,
      password: config.MYSQL_PASSWORD,
      database: config.MYSQL_DATABASE,
    });

    console.log('Running patch migrations for Backend Gap Audit features...');

    // Categories
    const [catCols] = await connection.query(`SHOW COLUMNS FROM categories LIKE 'deleted'`);
    if (catCols.length === 0) {
      await connection.query('ALTER TABLE categories ADD COLUMN deleted BOOLEAN DEFAULT FALSE');
      console.log('Added deleted column to categories');
    }

    // Offers
    const [offCols] = await connection.query(`SHOW COLUMNS FROM offers LIKE 'deleted'`);
    if (offCols.length === 0) {
      await connection.query('ALTER TABLE offers ADD COLUMN deleted BOOLEAN DEFAULT FALSE');
      console.log('Added deleted column to offers');
    }

    // Products
    const [prodCols] = await connection.query(`SHOW COLUMNS FROM products`);
    const colNames = prodCols.map(c => c.Field);
    
    if (!colNames.includes('deleted')) {
      await connection.query('ALTER TABLE products ADD COLUMN deleted BOOLEAN DEFAULT FALSE');
      console.log('Added deleted column to products');
    }
    if (!colNames.includes('is_combo')) {
      await connection.query('ALTER TABLE products ADD COLUMN is_combo BOOLEAN DEFAULT FALSE');
      console.log('Added is_combo column to products');
    }
    if (!colNames.includes('featured')) {
      await connection.query('ALTER TABLE products ADD COLUMN featured BOOLEAN DEFAULT FALSE');
      console.log('Added featured column to products');
    }
    if (!colNames.includes('display_order')) {
      await connection.query('ALTER TABLE products ADD COLUMN display_order INT NOT NULL DEFAULT 0');
      console.log('Added display_order column to products');
    }
    if (!colNames.includes('original_price')) {
      await connection.query('ALTER TABLE products ADD COLUMN original_price DECIMAL(10, 2)');
      console.log('Added original_price column to products');
    }
    await connection.query(`
      CREATE TABLE IF NOT EXISTS product_combo_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        combo_product_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        display_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_combo_product (combo_product_id, product_id),
        FOREIGN KEY (combo_product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        INDEX idx_combo_product (combo_product_id),
        INDEX idx_combo_item_product (product_id)
      )
    `);
    console.log('Product combo items table ready');
    if (!colNames.includes('discount_label')) {
      await connection.query('ALTER TABLE products ADD COLUMN discount_label VARCHAR(50)');
      console.log('Added discount_label column to products');
    }

    console.log('Patch migration successful!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) await connection.end();
  }
};

runMigration();
