require('dotenv').config();
const mysql = require('mysql2/promise');
const config = require('../config/env');

const migrate = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.MYSQL_HOST,
      port: config.MYSQL_PORT,
      user: config.MYSQL_USER,
      password: config.MYSQL_PASSWORD,
      database: config.MYSQL_DATABASE,
      multipleStatements: true
    });

    console.log('Connected to MySQL. Running migrations...');

    const ensureColumn = async (tableName, columnName, columnDefinition) => {
      const [columns] = await connection.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      `, [config.MYSQL_DATABASE, tableName, columnName]);

      if (columns.length === 0) {
        await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
      }
    };

    // Users Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        whatsapp_number VARCHAR(20),
        address TEXT,
        short_address VARCHAR(255),
        trusted BOOLEAN DEFAULT FALSE,
        blocked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_phone (phone)
      );
    `);
    const [shortAddressColumns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'short_address'
    `, [config.MYSQL_DATABASE]);
    if (shortAddressColumns.length === 0) {
      await connection.query('ALTER TABLE users ADD COLUMN short_address VARCHAR(255) AFTER address');
    }
    console.log('Users table ready.');

    // Categories Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        image_id VARCHAR(255),
        active BOOLEAN DEFAULT TRUE,
        display_order INT NOT NULL DEFAULT 0,
        deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_slug (slug)
      );
    `);
    const [categoryOrderColumns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'display_order'
    `, [config.MYSQL_DATABASE]);
    if (categoryOrderColumns.length === 0) {
      await connection.query('ALTER TABLE categories ADD COLUMN display_order INT NOT NULL DEFAULT 0 AFTER active');
    }
    await ensureColumn('categories', 'deleted', 'deleted BOOLEAN DEFAULT FALSE AFTER display_order');
    console.log('Categories table ready.');

    // Products Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        category_id INT NOT NULL,
        unit VARCHAR(50),
        description TEXT,
        image_id VARCHAR(255),
        available BOOLEAN DEFAULT TRUE,
        is_combo BOOLEAN DEFAULT FALSE,
        featured BOOLEAN DEFAULT FALSE,
        display_order INT NOT NULL DEFAULT 0,
        original_price DECIMAL(10, 2),
        discount_label VARCHAR(50),
        deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
        INDEX idx_category (category_id)
      );
    `);
    await ensureColumn('products', 'is_combo', 'is_combo BOOLEAN DEFAULT FALSE AFTER available');
    await ensureColumn('products', 'featured', 'featured BOOLEAN DEFAULT FALSE AFTER is_combo');
    await ensureColumn('products', 'display_order', 'display_order INT NOT NULL DEFAULT 0 AFTER featured');
    await ensureColumn('products', 'original_price', 'original_price DECIMAL(10, 2) AFTER display_order');
    await ensureColumn('products', 'discount_label', 'discount_label VARCHAR(50) AFTER original_price');
    await ensureColumn('products', 'deleted', 'deleted BOOLEAN DEFAULT FALSE AFTER discount_label');
    console.log('Products table ready.');

    // Orders Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(20) NOT NULL UNIQUE,
        customer_id INT NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        whatsapp_number VARCHAR(20),
        address TEXT NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        map_url TEXT,
        subtotal DECIMAL(10, 2) NOT NULL,
        delivery_charge DECIMAL(10, 2) NOT NULL,
        night_charge DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total DECIMAL(10, 2) NOT NULL,
        payment_method ENUM('Cash', 'UPI') DEFAULT 'Cash',
        payment_status ENUM('Pending', 'Paid', 'Failed', 'Refunded') DEFAULT 'Pending',
        status ENUM('Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled') DEFAULT 'Pending',
        note TEXT,
        cancel_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_customer (customer_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      );
    `);
    console.log('Orders table ready.');

    // Order Items Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        line_total DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );
    `);
    console.log('Order Items table ready.');

    // Settings Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_open BOOLEAN DEFAULT TRUE,
        delivery_available BOOLEAN DEFAULT TRUE,
        minimum_order_amount DECIMAL(10, 2) DEFAULT 149.00,
        delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
        free_delivery_above DECIMAL(10, 2),
        night_charge DECIMAL(10, 2) DEFAULT 0.00,
        night_charge_start TIME DEFAULT '21:00:00',
        night_charge_end TIME DEFAULT '07:00:00',
        whatsapp_number VARCHAR(20),
        upi_id VARCHAR(100),
        upi_qr_image_id VARCHAR(255),
        delivery_time_message VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    await ensureColumn('settings', 'upi_qr_image_id', 'upi_qr_image_id VARCHAR(255) AFTER upi_id');
    console.log('Settings table ready.');

    // Offers Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        image_id VARCHAR(255),
        active BOOLEAN DEFAULT FALSE,
        deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_active (active)
      );
    `);
    await ensureColumn('offers', 'deleted', 'deleted BOOLEAN DEFAULT FALSE AFTER active');
    console.log('Offers table ready.');

    // ---------------------------------------------------------
    // SEED DATA (Idempotent)
    // ---------------------------------------------------------
    console.log('Seeding data...');

    // Seed Settings
    const [settingsRows] = await connection.query('SELECT * FROM settings LIMIT 1');
    if (settingsRows.length === 0) {
      await connection.query(`
        INSERT INTO settings (minimum_order_amount, night_charge_start, night_charge_end, delivery_charge) 
        VALUES (149.00, '21:00:00', '07:00:00', 20.00)
      `);
      console.log('Seeded default settings.');
    }

    // Seed Categories
    const categories = [
      { name: 'Cold Drinks', slug: 'cold-drinks', type: 'packed', display_order: 1 },
      { name: 'Snacks', slug: 'snacks', type: 'packed', display_order: 2 },
      { name: 'Fast Food', slug: 'fast-food', type: 'fast_food', display_order: 3 },
      { name: 'Groceries', slug: 'groceries', type: 'packed', display_order: 4 },
      { name: 'Desserts', slug: 'desserts', type: 'fast_food', display_order: 5 },
      { name: 'Daily Essentials', slug: 'daily-essentials', type: 'packed', display_order: 6 }
    ];

    for (const cat of categories) {
      await connection.query(`
        INSERT IGNORE INTO categories (name, slug, type, display_order) VALUES (?, ?, ?, ?)
      `, [cat.name, cat.slug, cat.type, cat.display_order]);
      await connection.query(`
        UPDATE categories SET display_order = ? WHERE slug = ? AND display_order = 0
      `, [cat.display_order, cat.slug]);
    }
    console.log('Seeded frontend categories.');

    // Seed Optional Sample Products (for local testing)
    const [catRows] = await connection.query('SELECT id, slug FROM categories');
    const catMap = catRows.reduce((acc, row) => ({ ...acc, [row.slug]: row.id }), {});

    const sampleProducts = [
      { name: 'Coca Cola', price: 40.00, category_id: catMap['cold-drinks'], unit: '750ml' },
      { name: 'Lays Classic Salted', price: 20.00, category_id: catMap['snacks'], unit: '1 Pack' },
      { name: 'Aloo Tikki Burger', price: 60.00, category_id: catMap['fast-food'], unit: '1 pc' },
      { name: 'Atta (Wheat Flour)', price: 250.00, category_id: catMap['groceries'], unit: '5kg' },
      { name: 'Chocolate Brownie', price: 90.00, category_id: catMap['desserts'], unit: '1 pc' },
      { name: 'Amul Milk', price: 33.00, category_id: catMap['daily-essentials'], unit: '500ml' }
    ];

    for (const prod of sampleProducts) {
      if (prod.category_id) {
        await connection.query(`
          INSERT INTO products (name, price, category_id, unit) 
          SELECT ?, ?, ?, ? FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)
        `, [prod.name, prod.price, prod.category_id, prod.unit, prod.name]);
      }
    }
    console.log('Seeded sample products.');

    console.log('Migration and seeding completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

migrate();
