// Deal price coupons against a REAL MySQL: the cart preview and createOrder
// read coupons + coupon_deal_items, write the deal snapshot columns on orders
// and order_items, redeem the deal as its own coupon_redemptions row under the
// FOR UPDATE lock, and a cancel gives that redemption back.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const mockedModule = (modulePath) => {
  const actual = jest.requireActual(modulePath);
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => [
      key,
      typeof value === 'function' ? jest.fn().mockResolvedValue(null) : value,
    ])
  );
};

jest.mock('../../src/utils/notificationService', () => mockedModule('../../src/utils/notificationService'));
jest.mock('../../src/realtime/orderEvents', () => mockedModule('../../src/realtime/orderEvents'));
jest.mock('../../src/realtime/socket', () => mockedModule('../../src/realtime/socket'));
jest.mock('../../src/realtime/orderAutoAccept', () => mockedModule('../../src/realtime/orderAutoAccept'));
jest.mock('../../src/utils/adminNotifications', () => mockedModule('../../src/utils/adminNotifications'));
// The order route's per-user limiter would cap this file's checkouts.
jest.mock('express-rate-limit', () => {
  const factory = () => (req, res, next) => next();
  factory.rateLimit = factory;
  factory.ipKeyGenerator = (ip) => String(ip);
  return factory;
});

const {
  describeWithMysql,
  assertMysqlReady,
  pool,
  FIXTURE_TAG,
  createUser,
} = require('../helpers/realMysql');

const cartRoutes = require('../../src/routes/cartRoutes');
const orderRoutes = require('../../src/routes/orderRoutes');

const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

const tokenFor = (userId) => jwt.sign({ id: userId, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describeWithMysql('deal price coupons (real MySQL)', () => {
  const ids = {};

  beforeAll(async () => {
    await assertMysqlReady();
    const [cat] = await pool.query(
      "INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', 1)",
      [`${FIXTURE_TAG} Deal Cat`, `${FIXTURE_TAG.toLowerCase()}-deal-cat`]
    );
    ids.category = cat.insertId;
    const product = async (name, price) => {
      const [r] = await pool.query(
        `INSERT INTO products (name, price, category_id, area_id, available, deleted, is_combo)
         VALUES (?, ?, ?, 1, 1, 0, 0)`,
        [`${FIXTURE_TAG} ${name}`, price, ids.category]
      );
      return r.insertId;
    };
    ids.rice = await product('Rice', 300);
    ids.potato = await product('Potato', 30);

    // total_usage_limit 1: the second checkout must lose the deal.
    const [coupon] = await pool.query(
      `INSERT INTO coupons
         (code, title, discount_type, discount_value, min_order_amount, deal_max_items,
          total_usage_limit, per_user_usage_limit, target_audience, target_zones,
          auto_apply, requires_code, active, deleted, area_id)
       VALUES (NULL, ?, 'deal_price', 0, 299, 1, 1, NULL, 'all', 'all', 1, 0, 1, 0, 1)`,
      [`${FIXTURE_TAG} deal`]
    );
    ids.deal = coupon.insertId;
    await pool.query(
      'INSERT INTO coupon_deal_items (area_id, coupon_id, product_id, variant_id, deal_price) VALUES (1, ?, ?, NULL, 9)',
      [ids.deal, ids.potato]
    );
    ids.userA = await createUser('Deal A');
    ids.userB = await createUser('Deal B');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM coupon_redemptions WHERE coupon_id = ?', [ids.deal]);
    await pool.query('DELETE FROM orders WHERE customer_id IN (?)', [[ids.userA, ids.userB]]);
    await pool.query('DELETE FROM coupons WHERE id = ?', [ids.deal]); // cascades coupon_deal_items
    await pool.query('DELETE FROM products WHERE id IN (?)', [[ids.rice, ids.potato]]);
    await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    await pool.query('DELETE FROM users WHERE id IN (?)', [[ids.userA, ids.userB]]);
    await pool.end();
  });

  const cart = [
    { productId: 0, quantity: 1 },
    { productId: 0, quantity: 2 },
  ];
  const items = () => [
    { ...cart[0], productId: ids.rice },
    { ...cart[1], productId: ids.potato },
  ];

  it('the cart preview prices one potato at ₹9', async () => {
    const res = await request(app)
      .post('/api/cart/calculate')
      .set('Authorization', `Bearer ${tokenFor(ids.userA)}`)
      .send({ items: items(), no_auto_apply: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.subtotal).toBe(360);
    expect(res.body.dealDiscount).toBe(21);
    expect(res.body.deal).toMatchObject({ id: ids.deal, unlocked: true, maxItems: 1 });
    expect(res.body.items[1]).toMatchObject({ dealPrice: 9, dealQty: 1, unitPrice: 30, lineTotal: 60 });
    // The deal never shows up as a normal coupon offer.
    expect((res.body.availableCoupons || []).some((c) => c.id === ids.deal)).toBe(false);
  });

  it('createOrder snapshots the deal and redeems it', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(ids.userA)}`)
      .send({ address: '1 Deal St', paymentMethod: 'Cash', no_auto_apply: true, items: items() });

    expect(res.statusCode).toBe(201);
    ids.orderA = res.body.orderId;
    // Under NODE_ENV=test every order number is the same "…-TEST"; free it
    // for the next checkout in this file.
    await pool.query('UPDATE orders SET order_number = ? WHERE id = ?', [`${FIXTURE_TAG}-${ids.orderA}`, ids.orderA]);
    expect(res.body.order).toMatchObject({ dealDiscount: 21, dealId: ids.deal, discount: 21 });

    const [[order]] = await pool.query(
      'SELECT subtotal, discount_amount, deal_coupon_id, deal_title, deal_discount_amount, total, delivery_charge FROM orders WHERE id = ?',
      [ids.orderA]
    );
    expect(Number(order.subtotal)).toBe(360);
    expect(Number(order.discount_amount)).toBe(21);
    expect(Number(order.deal_discount_amount)).toBe(21);
    expect(order.deal_coupon_id).toBe(ids.deal);
    expect(order.deal_title).toBe(`${FIXTURE_TAG} deal`);
    expect(Number(order.total)).toBe(360 + Number(order.delivery_charge) - 21);

    const [lines] = await pool.query(
      'SELECT product_id, unit_price, line_total, deal_price, deal_qty FROM order_items WHERE order_id = ? ORDER BY id',
      [ids.orderA]
    );
    expect(lines.map((l) => [l.product_id, Number(l.unit_price), l.deal_price === null ? null : Number(l.deal_price), l.deal_qty]))
      .toEqual([[ids.rice, 300, null, 0], [ids.potato, 30, 9, 1]]);

    const [redemptions] = await pool.query(
      'SELECT discount_amount, status FROM coupon_redemptions WHERE order_id = ? AND coupon_id = ?',
      [ids.orderA, ids.deal]
    );
    expect(redemptions.map((r) => [Number(r.discount_amount), r.status])).toEqual([[21, 'active']]);
  });

  it('a used-up deal is dropped from the next order, not refused', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(ids.userB)}`)
      .send({ address: '2 Deal St', paymentMethod: 'Cash', no_auto_apply: true, items: items() });

    expect(res.statusCode).toBe(201);
    expect(res.body.order).toMatchObject({ dealDiscount: 0, dealId: null, discount: 0 });
    const [[order]] = await pool.query('SELECT deal_coupon_id, deal_discount_amount FROM orders WHERE id = ?', [res.body.orderId]);
    expect(order.deal_coupon_id).toBeNull();
    expect(Number(order.deal_discount_amount)).toBe(0);
  });

  it('cancelling the order gives the deal redemption back', async () => {
    const res = await request(app)
      .post(`/api/orders/${ids.orderA}/cancel`)
      .set('Authorization', `Bearer ${tokenFor(ids.userA)}`)
      .send({});

    expect(res.statusCode).toBe(200);
    const [[redemption]] = await pool.query(
      'SELECT status FROM coupon_redemptions WHERE order_id = ? AND coupon_id = ?',
      [ids.orderA, ids.deal]
    );
    expect(redemption.status).toBe('cancelled');
  });
});
