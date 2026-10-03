/**
 * createOrder with a deal price applied (coupon engine mocked): the deal is
 * snapshotted on the order and its items, redeemed as its own row, and its
 * coupon row is locked before the normal coupon's. Own file because the
 * order route's per-user rate limiter caps how many orders one file places.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => {
  const pool = { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn() };
  return {
    pool,
    beginReadCommitted: jest.fn(async () => {
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      return connection;
    }),
  };
});

jest.mock('../src/utils/coupons', () => ({
  validateCoupon: jest.fn().mockResolvedValue({ ok: false, reason: 'No coupon' }),
  validateCouponById: jest.fn().mockResolvedValue({ ok: false, reason: 'Coupon not found' }),
  pickBestAutoApply: jest.fn().mockResolvedValue(null),
  applyBestDeal: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/realtime/orderEvents', () => ({
  emitOrderCreated: jest.fn(),
  emitNotificationCreated: jest.fn(),
}));
jest.mock('../src/utils/notificationService', () => ({
  createOrderNotification: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/utils/adminNotifications', () => ({
  createAdminNotification: jest.fn().mockResolvedValue(null),
  TYPES: { NEW_ORDER: 'new_order' },
}));
jest.mock('../src/realtime/orderAutoAccept', () => ({ schedule: jest.fn() }));

const { pickBestAutoApply, applyBestDeal } = require('../src/utils/coupons');
const areaScope = require('../src/utils/areaScope');

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describe('createOrder with a deal price', () => {
  beforeAll(async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, code: 'A1', name: 'Area 1', active: 1, is_default: 1 }]]);
    await areaScope.getDefaultArea();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('places an order with the deal: snapshots, both redemptions, lock before the coupon', async () => {
    const queries = [];
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(async (sql, params) => {
        queries.push({ sql: String(sql), params });
        if (/FROM users/.test(sql)) return [[{ id: 1, name: 'T', phone: '1', whatsapp_number: '1', blocked: 0, address: 'A' }]];
        if (/FROM settings/.test(sql)) return [[{ shop_open: 1, delivery_available: 1, delivery_charge: 10, night_charge: 0 }]];
        if (/FROM products/.test(sql)) return [[{ id: 1, price: 300, name: 'Rice' }, { id: 2, price: 30, name: 'Potato' }]];
        if (/LAST_INSERT_ID/.test(sql)) return [[{ seq: 1 }]];
        if (/INSERT INTO orders/.test(sql)) return [{ insertId: 1201 }];
        return [[]];
      }),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);
    applyBestDeal.mockResolvedValueOnce({
      coupon: { id: 50, per_user_usage_limit: null, total_usage_limit: null },
      couponId: 50,
      title: '₹9ryday',
      dealDiscount: 21,
      unlocked: true,
      amountRemaining: 0,
      minOrder: 299,
      maxItems: 1,
      lines: [{ index: 1, dealPrice: 9, dealQty: 1 }],
    });
    pickBestAutoApply.mockResolvedValueOnce({
      coupon: { id: 5, code: null, title: 'Free Delivery', discount_type: 'free_delivery', per_user_usage_limit: null, total_usage_limit: null },
      discount: 10,
      itemDiscount: 0,
      freeDeliveryWaiver: 10,
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }],
      });

    expect(res.statusCode).toEqual(201);
    // Coupon runs on the subtotal after the deal saving.
    expect(pickBestAutoApply).toHaveBeenCalledWith(expect.objectContaining({ subtotal: 309 }));
    expect(res.body.order).toMatchObject({
      subtotal: 330,
      discount: 31,
      couponDiscount: 10,
      dealDiscount: 21,
      dealId: 50,
      dealTitle: '₹9ryday',
      itemDiscount: 21,
      total: 309,
    });
    expect(res.body.order.items[1]).toMatchObject({ unitPrice: 30, lineTotal: 30, dealPrice: 9, dealQty: 1 });

    const locks = queries.filter((q) => /FOR UPDATE/.test(q.sql) && /FROM coupons/.test(q.sql)).map((q) => q.params[0]);
    expect(locks).toEqual([50, 5]);

    const orderInsert = queries.find((q) => /INSERT INTO orders/.test(q.sql));
    // ..., discount_amount (coupon + deal), free_delivery_waiver_amount, deal_coupon_id, deal_title, deal_discount_amount
    expect(orderInsert.params.slice(-5)).toEqual([31, 10, 50, '₹9ryday', 21]);

    const itemsInsert = queries.find((q) => /INSERT INTO order_items/.test(q.sql));
    expect(itemsInsert.sql).toContain('deal_price, deal_qty');
    // Second line ends with its deal_price, deal_qty; normal unit_price stays.
    expect(itemsInsert.params.slice(-2)).toEqual([9, 1]);
    expect(itemsInsert.params.slice(13, 15)).toEqual([null, 0]);

    const redemptions = queries.filter((q) => /INSERT INTO coupon_redemptions/.test(q.sql)).map((q) => [q.params[0], q.params[3]]);
    expect(redemptions).toEqual([[5, 10], [50, 21]]);
  });

  it('drops a deal whose usage limit was taken under the lock', async () => {
    const queries = [];
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(async (sql, params) => {
        queries.push({ sql: String(sql), params });
        if (/FROM users/.test(sql)) return [[{ id: 1, name: 'T', phone: '1', whatsapp_number: '1', blocked: 0, address: 'A' }]];
        if (/FROM settings/.test(sql)) return [[{ shop_open: 1, delivery_available: 1, delivery_charge: 10, night_charge: 0 }]];
        if (/FROM products/.test(sql)) return [[{ id: 1, price: 300, name: 'Rice' }, { id: 2, price: 30, name: 'Potato' }]];
        if (/FROM coupon_redemptions/.test(sql)) return [[{ count: 5 }]];
        if (/LAST_INSERT_ID/.test(sql)) return [[{ seq: 1 }]];
        if (/INSERT INTO orders/.test(sql)) return [{ insertId: 1202 }];
        return [[]];
      }),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);
    applyBestDeal.mockResolvedValueOnce({
      coupon: { id: 50, per_user_usage_limit: null, total_usage_limit: 5 },
      couponId: 50,
      title: '₹9ryday',
      dealDiscount: 21,
      unlocked: true,
      lines: [{ index: 1, dealPrice: 9, dealQty: 1 }],
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }],
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.order).toMatchObject({ discount: 0, dealDiscount: 0, dealId: null, total: 340 });
    expect(res.body.order.items[1]).toMatchObject({ dealPrice: null, dealQty: 0 });
    expect(queries.some((q) => /INSERT INTO coupon_redemptions/.test(q.sql))).toBe(false);
  });

});
