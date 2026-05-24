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

  it('should calculate cart totals', async () => {
    pool.query.mockResolvedValueOnce([[{ shop_open: 1, delivery_charge: 10, free_delivery_above: 500, night_charge: 0 }]]); // settings
    pool.query.mockResolvedValueOnce([[{ id: 1, price: 100, available: 1 }]]); // product query

    const res = await request(app)
      .post('/api/cart/calculate')
      .send({
        items: [{ productId: 1, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.subtotal).toEqual(200);
    expect(res.body.deliveryCharge).toEqual(10);
    expect(res.body.total).toEqual(210);
    expect(res.body.valid).toEqual(true);
  });

  it('should create an order when customer is inside delivery radius', async () => {
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
        delivery_charge: 10,
        free_delivery_above: 500,
        night_charge: 0,
        shop_latitude: 12.9716,
        shop_longitude: 77.5946,
        delivery_radius_km: 8,
        delivery_cost_per_km: 5
      }]]) // settings
      .mockResolvedValueOnce([[{ id: 1, price: 100, available: 1, name: 'Test Product' }]]) // product check
      .mockResolvedValueOnce([{ insertId: 1001 }]); // insert order

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
