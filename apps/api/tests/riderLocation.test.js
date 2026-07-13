/**
 * Tests for POST /api/rider/me/location + order-detail rider last-position.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const riderRoutes = require('../src/routes/riderRoutes');
const { pool } = require('../src/db/mysql');
const { emitToCustomer } = require('../src/realtime/socket');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToAllCustomers: jest.fn(),
}));
jest.mock('../src/utils/shops', () => ({
  syncGlobalShopOpenState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/controllers/settingsController', () => ({
  bustSettingsCache: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/rider', riderRoutes);

const customerToken = (id = 7) => jwt.sign(
  { id, role: 'customer' },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

const RIDER_ROW = {
  id: 3,
  user_id: 7,
  display_name: 'Ravi',
  phone: '999',
  active: 1,
  is_online: 1,
  last_heartbeat_at: '2026-07-13T10:00:00Z',
};

describe('POST /api/rider/me/location', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('non-rider customer -> 403 FORBIDDEN', async () => {
    pool.query.mockResolvedValueOnce([[]]); // requireRider

    const res = await request(app)
      .post('/api/rider/me/location')
      .set('Authorization', `Bearer ${customerToken(99)}`)
      .send({ lat: 29.5, lng: 75.4 });

    expect(res.statusCode).toEqual(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(emitToCustomer).not.toHaveBeenCalled();
  });

  it('invalid coordinates -> 400 INVALID_COORDINATES', async () => {
    pool.query.mockResolvedValueOnce([[RIDER_ROW]]); // requireRider

    const res = await request(app)
      .post('/api/rider/me/location')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ lat: 999, lng: 75.4 });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toBe('INVALID_COORDINATES');
    expect(emitToCustomer).not.toHaveBeenCalled();
  });

  it('valid ping with active order persists + emits rider.location.updated', async () => {
    pool.query
      .mockResolvedValueOnce([[RIDER_ROW]]) // requireRider
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE last_*
      .mockResolvedValueOnce([[{ id: 42, customer_id: 11 }]]); // active order

    const res = await request(app)
      .post('/api/rider/me/location')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ lat: 29.5152, lng: 75.4548 });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ ok: true });

    const updateCall = pool.query.mock.calls.find((c) =>
      String(c[0]).includes('SET last_lat')
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toEqual([29.5152, 75.4548, 3]);

    expect(emitToCustomer).toHaveBeenCalledTimes(1);
    expect(emitToCustomer).toHaveBeenCalledWith(
      11,
      'rider.location.updated',
      expect.objectContaining({
        orderId: 42,
        order_id: 42,
        riderId: 3,
        rider_id: 3,
        lat: 29.5152,
        lng: 75.4548,
        latitude: 29.5152,
        longitude: 75.4548,
      })
    );
  });

  it('accepts latitude/longitude aliases', async () => {
    pool.query
      .mockResolvedValueOnce([[RIDER_ROW]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[]]); // no active order

    const res = await request(app)
      .post('/api/rider/me/location')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ latitude: 29.1, longitude: 75.2 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toBe(true);
    const updateCall = pool.query.mock.calls.find((c) =>
      String(c[0]).includes('SET last_lat')
    );
    expect(updateCall[1]).toEqual([29.1, 75.2, 3]);
    expect(emitToCustomer).not.toHaveBeenCalled();
  });

  it('valid ping with no active order persists without emit', async () => {
    pool.query
      .mockResolvedValueOnce([[RIDER_ROW]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/rider/me/location')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ lat: 29.5, lng: 75.4 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toBe(true);
    expect(pool.query.mock.calls.some((c) => String(c[0]).includes('SET last_lat'))).toBe(true);
    expect(emitToCustomer).not.toHaveBeenCalled();
  });
});
