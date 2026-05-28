const request = require('supertest');
const express = require('express');
const cartRoutes = require('../src/routes/cartRoutes');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describe('Cart and Order Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should apply ₹20 delivery when cart subtotal is below the free delivery threshold', async () => {
    pool.query.mockResolvedValueOnce([[{ shop_open: 1, minimum_order_amount: 300, delivery_charge: 10, free_delivery_above: 500, night_charge: 0 }]]); // settings
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1 }]]); // product query

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.subtotal).toEqual(200);
    expect(res.body.deliveryCharge).toEqual(20);
    expect(res.body.total).toEqual(220);
    expect(res.body.valid).toEqual(true);
  });

  it('should make delivery free when cart subtotal reaches the free delivery threshold', async () => {
    pool.query.mockResolvedValueOnce([[{
      shop_open: 1,
      minimum_order_amount: 149,
      delivery_charge: 10,
      free_delivery_above: 500,
      night_charge: 0,
      shop_latitude: 12.9716,
      shop_longitude: 77.5946,
      delivery_radius_km: 8,
      delivery_cost_per_km: 10,
      free_delivery_offer_active: 0
    }]]);
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]);

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        latitude: 12.9716,
        longitude: 77.6046,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.subtotal).toEqual(200);
    expect(res.body.deliveryDistanceKm).toBeGreaterThan(0);
    expect(res.body.deliveryWithinRange).toBe(true);
    expect(res.body.requiresLocation).toBe(false);
    expect(res.body.deliveryCharge).toBe(0);
    expect(res.body.deliveryMessage).toBe('Free delivery unlocked!');
  });

  it('should use admin configured below-threshold charge', async () => {
    pool.query.mockResolvedValueOnce([[{
      shop_open: 1,
      minimum_order_amount: 300,
      below_threshold_delivery_charge: 35,
      delivery_charge: 10,
      night_charge: 0,
      shop_latitude: 12.9716,
      shop_longitude: 77.5946,
      delivery_radius_km: 8,
      delivery_cost_per_km: 10,
      free_delivery_offer_active: 0,
      free_delivery_above_minimum_active: 1
    }]]);
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]);

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        latitude: 12.9716,
        longitude: 77.6046,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.subtotal).toEqual(200);
    expect(res.body.deliveryCharge).toBeCloseTo(10.84, 2);
  });

  it('should apply standard delivery charge above threshold when admin disables free threshold delivery', async () => {
    pool.query.mockResolvedValueOnce([[{
      shop_open: 1,
      minimum_order_amount: 149,
      below_threshold_delivery_charge: 35,
      delivery_charge: 12,
      night_charge: 0,
      shop_latitude: 12.9716,
      shop_longitude: 77.5946,
      delivery_radius_km: 8,
      delivery_cost_per_km: 10,
      free_delivery_offer_active: 0,
      free_delivery_above_minimum_active: 0
    }]]);
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]);

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        latitude: 12.9716,
        longitude: 77.6046,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.subtotal).toEqual(200);
    expect(res.body.deliveryCharge).toBeCloseTo(10.84, 2);
    expect(res.body.deliveryMessage).toBe('Standard delivery charge ₹10.84 applied.');
  });

  it('should return out-of-range cart status without blocking calculation response', async () => {
    pool.query.mockResolvedValueOnce([[{
      shop_open: 1,
      minimum_order_amount: 149,
      delivery_charge: 10,
      free_delivery_above: 500,
      night_charge: 0,
      shop_latitude: 12.9716,
      shop_longitude: 77.5946,
      delivery_radius_km: 8,
      delivery_cost_per_km: 10,
      free_delivery_offer_active: 0
    }]]);
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]);

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        latitude: 13.2,
        longitude: 77.5946,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.deliveryWithinRange).toBe(false);
    expect(res.body.valid).toBe(false);
    expect(res.body.deliveryCharge).toBe(0);
    expect(res.body.deliveryMessage).toContain('exceeds our delivery limit');
  });

  it('should make cart delivery free when free delivery offer is active', async () => {
    pool.query.mockResolvedValueOnce([[{
      shop_open: 1,
      minimum_order_amount: 149,
      delivery_charge: 10,
      free_delivery_above: 500,
      night_charge: 0,
      shop_latitude: 12.9716,
      shop_longitude: 77.5946,
      delivery_radius_km: 8,
      delivery_cost_per_km: 10,
      free_delivery_offer_active: 1
    }]]);
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]);

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        latitude: 12.9716,
        longitude: 77.6046,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.deliveryWithinRange).toBe(true);
    expect(res.body.freeDeliveryOfferActive).toBe(true);
    expect(res.body.deliveryCharge).toBe(0);
  });

  it('should create an order when customer is inside delivery radius', async () => {
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn((sql, params) => { console.log('QUERY:', sql); return Promise.resolve(); }),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    mockConnection.query
      .mockResolvedValueOnce([[{ blocked: 0 }]]) // user check
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
      }]]) // settings
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]) // product check
      .mockResolvedValueOnce([{ insertId: 1001 }])
      .mockResolvedValueOnce([[{ COLUMN_NAME: "item_type" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // insert order

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        latitude: 12.9716,
        longitude: 77.5946,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('orderId', 1001);
    expect(res.body.order).toHaveProperty('deliveryDistanceKm', 0);
    expect(res.body.order).toHaveProperty('deliveryRadiusKmSnapshot', 8);
    expect(res.body.order).toHaveProperty('deliveryCostPerKmSnapshot', 5);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });

  it('should create matching delivery charge between cart preview and order creation', async () => {
    const settings = {
      shop_open: 1,
      delivery_available: 1,
      minimum_order_amount: 300,
      delivery_charge: 10,
      free_delivery_above: 500,
      night_charge: 0,
      shop_latitude: 12.9716,
      shop_longitude: 77.5946,
      delivery_radius_km: 8,
      delivery_cost_per_km: 10,
      free_delivery_offer_active: 0
    };

    pool.query.mockResolvedValueOnce([[settings]]);
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]);

    const cartRes = await request(app)
      .post('/api/cart/calculate')
      .send({
        latitude: 12.9716,
        longitude: 77.6046,
        items: [{ productId: 1, quantity: 2 }]
      });

    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    mockConnection.query
      .mockResolvedValueOnce([[{ blocked: 0 }]])
      .mockResolvedValueOnce([[settings]])
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]])
      .mockResolvedValueOnce([{ insertId: 1002 }])
      .mockResolvedValueOnce([[{ COLUMN_NAME: "item_type" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        latitude: 12.9716,
        longitude: 77.6046,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(orderRes.statusCode).toEqual(201);
    expect(orderRes.body.order.deliveryCharge).toBeCloseTo(cartRes.body.deliveryCharge, 2);
    expect(orderRes.body.order.deliveryCharge).toBeCloseTo(10.84, 2);
    expect(orderRes.body.order.deliveryDistanceKm).toBeCloseTo(cartRes.body.deliveryDistanceKm, 4);
  });

  it('should fail order creation when coordinates are missing', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toEqual('VALIDATION_ERROR');
    expect(res.body.details).toHaveProperty('latitude', 'Latitude is required');
  });

  it('should fail order creation when coordinates are invalid', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        latitude: 200,
        longitude: 77.5946,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toEqual('VALIDATION_ERROR');
    expect(res.body.details).toHaveProperty('latitude', 'Invalid GPS coordinates provided');
  });

  it('should fail order creation when customer is out of range', async () => {
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    mockConnection.query
      .mockResolvedValueOnce([[{ blocked: 0 }]]) // user check
      .mockResolvedValueOnce([[{
        shop_open: 1,
        delivery_available: 1,
        shop_latitude: 12.9716,
        shop_longitude: 77.5946,
        delivery_radius_km: 8,
        delivery_cost_per_km: 5
      }]]) // settings
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]); // product check

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        latitude: 14.0, // far away
        longitude: 77.5946,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toEqual('VALIDATION_ERROR');
    expect(res.body.message).toContain('exceeds our delivery limit');
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });

  it('should fail order creation when shop coordinates are missing', async () => {
    const mockConnection = {
      beginTransaction: jest.fn(),
      query: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(mockConnection);

    mockConnection.query
      .mockResolvedValueOnce([[{ blocked: 0 }]]) // user check
      .mockResolvedValueOnce([[{
        shop_open: 1,
        delivery_available: 1,
        shop_latitude: null, // missing
        shop_longitude: null,
        delivery_radius_km: 8,
        delivery_cost_per_km: 5
      }]]) // settings
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]); // product check

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: '123 Test St',
        paymentMethod: 'Cash',
        latitude: 12.9716,
        longitude: 77.5946,
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toEqual('VALIDATION_ERROR');
    expect(res.body.message).toContain('Shop location is not configured');
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });
});
