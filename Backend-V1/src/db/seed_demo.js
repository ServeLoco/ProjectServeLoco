require('dotenv').config();
const { pool } = require('./mysql');
const { getDb } = require('./mongodb');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

async function seedDemoData() {
  console.log('Seeding demo data...');

  try {
    // 1. Settings and Offers
    await pool.query('INSERT IGNORE INTO settings (id, shop_open, minimum_order_amount, delivery_charge, free_delivery_above) VALUES (1, 1, 50, 10, 500)');
    await pool.query('INSERT INTO offers (title, description, active) VALUES ("Weekend Snack Combo", "Get 20% extra on all snacks this weekend!", 1)');

    // 2. Customers
    const passwordHash = await bcrypt.hash('password123', 10);
    const [c1] = await pool.query(
      'INSERT INTO users (name, phone, whatsapp_number, password, address, trusted, blocked) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Demo User', '9999999999', '9999999999', passwordHash, '123 Demo Street', 1, 0]
    );
    const [c2] = await pool.query(
      'INSERT INTO users (name, phone, whatsapp_number, password, address, trusted, blocked) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Blocked User', '8888888888', '8888888888', passwordHash, '456 Bad Street', 0, 1]
    );

    const customerId = c1.insertId;

    // 3. Categories (Assume some are already seeded by migrate.js, let's insert if they don't exist)
    const [catRes1] = await pool.query('INSERT IGNORE INTO categories (name, slug, type, active) VALUES ("Fast Food", "fast-food", "fast_food", 1)');
    const [catRes2] = await pool.query('INSERT IGNORE INTO categories (name, slug, type, active) VALUES ("Packed Items", "packed-items", "packed", 1)');

    const [fastFoodCat] = await pool.query('SELECT id FROM categories WHERE slug = "fast-food"');
    const [packedCat] = await pool.query('SELECT id FROM categories WHERE slug = "packed-items"');

    // Mock Image in MongoDB
    const db = getDb();
    const imageDoc = {
      filename: 'demo-image.jpg',
      url: `${process.env.PUBLIC_BASE_URL || 'http://10.0.2.2:3000'}/api/images/demo-image.jpg`,
      storageType: 'disk',
      mimeType: 'image/jpeg',
      size: 1024,
      uploadedAt: new Date()
    };
    const result = await db.collection('images').insertOne(imageDoc);
    const imageId = result.insertedId.toString();

    // 4. Products
    // Fast Food (with image)
    const [p1] = await pool.query(
      'INSERT INTO products (name, category_id, price, unit, available, image_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['Demo Burger', fastFoodCat[0].id, 150, 'piece', 1, imageId]
    );

    // Packed Item (no image)
    const [p2] = await pool.query(
      'INSERT INTO products (name, category_id, price, unit, available) VALUES (?, ?, ?, ?, ?)',
      ['Demo Chips', packedCat[0].id, 20, 'packet', 1]
    );

    // Unavailable product
    const [p3] = await pool.query(
      'INSERT INTO products (name, category_id, price, unit, available) VALUES (?, ?, ?, ?, ?)',
      ['Out of Stock Item', packedCat[0].id, 50, 'packet', 0]
    );

    // 5. Orders in various states
    const states = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    
    for (let i = 0; i < states.length; i++) {
      const orderNumber = `#DEMO-${1000 + i}`;
      const status = states[i];
      const paymentStatus = (status === 'Delivered') ? 'Paid' : 'Pending';

      const [orderRes] = await pool.query(
        'INSERT INTO orders (order_number, customer_id, customer_name, phone, address, total, status, payment_method, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [orderNumber, customerId, 'Demo User', '9999999999', '123 Demo Street', 170, status, 'Cash', paymentStatus]
      );

      await pool.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)',
        [orderRes.insertId, p1.insertId, 'Demo Burger', 1, 150, 150]
      );
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)',
        [orderRes.insertId, p2.insertId, 'Demo Chips', 1, 20, 20]
      );
    }

    console.log('Demo data seeded successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding demo data:', err);
    process.exit(1);
  }
}

seedDemoData();
