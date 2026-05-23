require('dotenv').config();
const { pool } = require('./mysql');
const { getDb, connect } = require('./mongodb');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt'); // use bcrypt (not bcryptjs) — matches package.json

async function seedDemoData() {
  console.log('Seeding demo data...');

  try {
    await connect();
    // 1. Settings and Offers
    await pool.query('INSERT IGNORE INTO settings (id, shop_open, minimum_order_amount, delivery_charge, free_delivery_above) VALUES (1, 1, 50, 10, 500)');
    await pool.query('DELETE FROM offers WHERE title = "Weekend Snack Combo"');
    await pool.query('INSERT INTO offers (title, description, active) VALUES ("Weekend Snack Combo", "Get 20% extra on all snacks this weekend!", 1)');

    // 2. Customers — note column is password_hash (not password)
    const passwordHash = await bcrypt.hash('password123', 10);
    await pool.query(
      `INSERT INTO users (name, phone, whatsapp_number, password_hash, address, trusted, blocked)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        whatsapp_number = VALUES(whatsapp_number),
        password_hash = VALUES(password_hash),
        address = VALUES(address),
        trusted = VALUES(trusted),
        blocked = VALUES(blocked)`,
      ['Demo User', '9999999999', '9999999999', passwordHash, '123 Demo Street', 1, 0]
    );
    await pool.query(
      `INSERT INTO users (name, phone, whatsapp_number, password_hash, address, trusted, blocked)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        whatsapp_number = VALUES(whatsapp_number),
        password_hash = VALUES(password_hash),
        address = VALUES(address),
        trusted = VALUES(trusted),
        blocked = VALUES(blocked)`,
      ['Blocked User', '8888888888', '8888888888', passwordHash, '456 Bad Street', 0, 1]
    );

    const [customerRows] = await pool.query('SELECT id FROM users WHERE phone = ?', ['9999999999']);
    const customerId = customerRows[0].id;

    await pool.query(`
      DELETE oi FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.order_number LIKE 'SL-DEMO-%'
    `);
    await pool.query('DELETE FROM orders WHERE order_number LIKE "SL-DEMO-%"');

    // 3. Categories — insert if they don't exist
    await pool.query('INSERT IGNORE INTO categories (name, slug, type, active) VALUES ("Fast Food", "fast-food", "fast_food", 1)');
    await pool.query('INSERT IGNORE INTO categories (name, slug, type, active) VALUES ("Packed Items", "packed-items", "packed", 1)');

    const [fastFoodCat] = await pool.query('SELECT id FROM categories WHERE slug = "fast-food"');
    const [packedCat] = await pool.query('SELECT id FROM categories WHERE slug = "packed-items"');

    if (!fastFoodCat[0] || !packedCat[0]) {
      throw new Error('Required categories not found. Run npm run db:migrate first.');
    }

    // Mock Image in MongoDB
    const db = getDb();
    const imageDoc = {
      filename: 'demo-image.jpg',
      url: `${process.env.PUBLIC_BASE_URL || 'http://10.0.2.2:3000'}/uploads/demo-image.jpg`,
      storageType: 'disk',
      mimeType: 'image/jpeg',
      size: 1024,
      uploadedAt: new Date()
    };
    const imgResult = await db.collection('images').insertOne(imageDoc);
    const imageId = imgResult.insertedId.toString();

    // 4. Products
    // Fast Food — with image
    await pool.query(
      `INSERT INTO products (name, category_id, price, unit, available, image_id)
       SELECT ?, ?, ?, ?, ?, ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)`,
      ['Demo Burger', fastFoodCat[0].id, 150, 'piece', 1, imageId, 'Demo Burger']
    );
    const [demoBurgerRows] = await pool.query('SELECT id FROM products WHERE name = ?', ['Demo Burger']);

    // Packed Item — no image
    await pool.query(
      `INSERT INTO products (name, category_id, price, unit, available)
       SELECT ?, ?, ?, ?, ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)`,
      ['Demo Chips', packedCat[0].id, 20, 'packet', 1, 'Demo Chips']
    );
    const [demoChipsRows] = await pool.query('SELECT id FROM products WHERE name = ?', ['Demo Chips']);

    // Unavailable product
    await pool.query(
      `INSERT INTO products (name, category_id, price, unit, available)
       SELECT ?, ?, ?, ?, ? FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = ?)`,
      ['Out of Stock Item', packedCat[0].id, 50, 'packet', 0, 'Out of Stock Item']
    );

    const demoBurgerId = demoBurgerRows[0].id;
    const demoChipsId = demoChipsRows[0].id;

    // 5. Orders in various states — include all required NOT NULL columns
    const states = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

    for (let i = 0; i < states.length; i++) {
      const orderNumber = `SL-DEMO-${1000 + i}`;
      const status = states[i];
      const paymentStatus = (status === 'Delivered') ? 'Paid' : 'Pending';

      const [orderRes] = await pool.query(
        'INSERT INTO orders (order_number, customer_id, customer_name, phone, address, subtotal, delivery_charge, night_charge, total, status, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [orderNumber, customerId, 'Demo User', '9999999999', '123 Demo Street', 160, 10, 0, 170, status, 'Cash', paymentStatus]
      );

      await pool.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)',
        [orderRes.insertId, demoBurgerId, 'Demo Burger', 1, 150, 150]
      );
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)',
        [orderRes.insertId, demoChipsId, 'Demo Chips', 1, 20, 20]
      );
    }

    console.log('Demo data seeded successfully.');
    console.log('Test credentials: phone=9999999999 password=password123');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding demo data:', err);
    process.exit(1);
  }
}

seedDemoData();
