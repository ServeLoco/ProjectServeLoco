const request = require('supertest');
const express = require('express');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describe('Order idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the same order on a second request with the same Idempotency-Key', async () => {
    // The idempotency lookup now runs INSIDE the transaction with
    // SELECT ... FOR UPDATE so concurrent requests serialize. The lookup
    // uses the connection (not pool.query directly).
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    // 1. Idempotency lookup (FOR UPDATE) — row found.
    // 2. order_items lookup so the replay returns full details.
    mockConnection.query
      .mockResolvedValueOnce([[{
        id: 501,
        order_number: 'OD-EXISTING',
        idempotency_key_created_at: new Date(),
        age_seconds: 30,
      }]])
      .mockResolvedValueOnce([[{
        product_id: 1,
        item_type: 'product',
        product_name: 'Samosa',
        quantity: 2,
        unit_price: 20,
        line_total: 40,
      }]]);

    const idempotencyKey = 'idem-test-abc-123';

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 1 }],
      });

    if (res.statusCode === 500) console.log('DEBUG 500 body:', JSON.stringify(res.body));
    expect(res.statusCode).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(res.body.orderId).toBe(501);
    expect(res.body.orderNumber).toBe('OD-EXISTING');
    // Replay must include full order items (Fix #4) so the confirmation
    // screen can render properly.
    expect(Array.isArray(res.body.order.items)).toBe(true);
    expect(res.body.order.items.length).toBe(1);
    expect(res.body.order.items[0].name).toBe('Samosa');
    // No INSERT should have been issued.
    const insertCalls = mockConnection.query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && /INSERT INTO orders/i.test(sql)
    );
    expect(insertCalls.length).toBe(0);
    // Connection must be released cleanly.
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });

  it('proceeds with normal order creation when no Idempotency-Key is provided', async () => {
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    mockConnection.query
      .mockResolvedValueOnce([[{ blocked: 0 }]])
      .mockResolvedValueOnce([[{
        shop_open: 1,
        delivery_available: 1,
        minimum_order_amount: 0,
        below_threshold_delivery_charge: 0,
        free_delivery_above_minimum_active: 0,
      }]])
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test' }]])
      .mockResolvedValueOnce([{ insertId: 999 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 1 }],
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.idempotent).toBeUndefined();
    expect(res.body.orderId).toBe(999);
  });

  it('ignores the Idempotency-Key when an expired (>5min) key is reused', async () => {
    // First query (idempotency lookup inside the transaction) returns
    // empty — key is older than 5 minutes, so the controller proceeds
    // with normal creation.
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    // The controller inside a transaction runs:
    //  0. idempotency lookup (empty — expired)
    //  1. user lookup (returns user)
    //  2. settings lookup
    //  3. product query
    //  4. order INSERT
    //  5. order_items INSERT
    mockConnection.query
      .mockResolvedValueOnce([[]]) // expired idempotency lookup
      .mockResolvedValueOnce([[{
        id: 1, name: 'Test', phone: '123', whatsapp_number: '123', blocked: 0, address: 'Addr'
      }]])
      .mockResolvedValueOnce([[{
        shop_open: 1,
        delivery_available: 1,
        minimum_order_amount: 149,
        delivery_charge: 10,
        free_delivery_above: 500,
        night_charge: 0,
        shop_latitude: 12.9716,
        shop_longitude: 77.5946,
        delivery_radius_km: 8,
        delivery_cost_per_km: 5
      }]])
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test' }]])
      .mockResolvedValueOnce([{ insertId: 777 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-old-key-123')
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 1 }],
      });

    if (res.statusCode === 500) console.log('DEBUG 500 body:', JSON.stringify(res.body));
    expect(res.statusCode).toBe(201);
    expect(res.body.idempotent).toBeUndefined();
    expect(res.body.orderId).toBe(777);
  });

  it('uses SELECT ... FOR UPDATE so concurrent requests serialize (race safety)', async () => {
    // Simulate two concurrent requests with the same Idempotency-Key.
    // Both should serialize through the transaction. The first wins
    // (creates the order); the second sees the first's row and returns
    // it as an idempotent replay.
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    // Request 1: idempotency lookup (empty), user, settings, product,
    // INSERT, INSERT items.
    // Request 2 would hit the same connection mock — the second
    // invocation of the test path would see a row inserted by request 1.
    // For this test we just verify the SQL uses FOR UPDATE.
    mockConnection.query.mockResolvedValueOnce([[]]); // expired/not found
    mockConnection.query.mockResolvedValueOnce([[{
      id: 1, name: 'Test', phone: '123', whatsapp_number: '123', blocked: 0, address: 'Addr'
    }]]);
    mockConnection.query.mockResolvedValueOnce([[{
      shop_open: 1, delivery_available: 1, minimum_order_amount: 149,
      delivery_charge: 10, night_charge: 0,
      shop_latitude: 12.97, shop_longitude: 77.59,
      delivery_radius_km: 8, delivery_cost_per_km: 5
    }]]);
    mockConnection.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test' }]]);
    mockConnection.query.mockResolvedValueOnce([{ insertId: 888 }]);
    mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-race-test-456')
      .send({
        address: '456 Race St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 1 }],
      });

    // We don't assert status (depends on whether the race-resolution
    // path returned 201 or 200) — we assert the SQL contract: the very
    // first query on the connection must use FOR UPDATE so concurrent
    // attempts serialize.
    expect(res.statusCode).toBe(201);
    const firstCall = mockConnection.query.mock.calls[0];
    expect(firstCall[0]).toMatch(/FOR UPDATE/);
  });
});
