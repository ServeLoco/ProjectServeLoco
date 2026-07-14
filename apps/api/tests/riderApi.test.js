/**
 * Tests for rider API skeleton — /api/rider/me, /me/online.
 * Mirrors shopOwner.test.js: mock pool + mount real riderRoutes.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const riderRoutes = require('../src/routes/riderRoutes');
const { pool } = require('../src/db/mysql');

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
  is_online: 0,
  last_heartbeat_at: null,
};

describe('Rider API skeleton - /api/rider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('non-rider customer -> 403 FORBIDDEN', async () => {
    pool.query.mockResolvedValueOnce([[]]); // requireRider lookup

    const res = await request(app)
      .get('/api/rider/me')
      .set('Authorization', `Bearer ${customerToken(99)}`);

    expect(res.statusCode).toEqual(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.message).toBe('Not a rider');
  });

  it('GET /me returns shaped rider for active rider', async () => {
    pool.query
      .mockResolvedValueOnce([[RIDER_ROW]]) // requireRider
      .mockResolvedValueOnce([[]]) // current assignment
      .mockResolvedValueOnce([[]]); // active offer

    const res = await request(app)
      .get('/api/rider/me')
      .set('Authorization', `Bearer ${customerToken(7)}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.rider).toEqual(expect.objectContaining({
      id: 3,
      userId: 7,
      displayName: 'Ravi',
      isOnline: false,
      is_online: false,
      active: true,
    }));
    expect(res.body.currentAssignment).toBeNull();
    expect(res.body.activeOffer).toBeNull();
  });

  it('PATCH /me/online true sets online and syncs delivery', async () => {
    const onlineRow = { ...RIDER_ROW, is_online: 1 };
    pool.query
      .mockResolvedValueOnce([[RIDER_ROW]]) // requireRider
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE online
      .mockResolvedValueOnce([[onlineRow]]) // re-select rider
      // syncDeliveryAvailabilityFromRiders:
      .mockResolvedValueOnce([[{ cnt: 1 }]]) // countActiveRiders
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]) // settings
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE delivery_available

    const res = await request(app)
      .patch('/api/rider/me/online')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ isOnline: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body.rider.isOnline).toBe(true);
    expect(res.body.isOnline).toBe(true);
    expect(pool.query.mock.calls.some((c) =>
      String(c[0]).includes('SET is_online = 1')
    )).toBe(true);
  });

  it('PATCH /me/online false goes offline when no active jobs', async () => {
    const onlineRider = { ...RIDER_ROW, is_online: 1, last_heartbeat_at: new Date() };
    const offlineRow = { ...RIDER_ROW, is_online: 0, last_heartbeat_at: null };
    pool.query
      .mockResolvedValueOnce([[onlineRider]]) // requireRider
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // active assignment count
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // SET is_online = 0
      .mockResolvedValueOnce([[offlineRow]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .patch('/api/rider/me/online')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ is_online: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body.rider.isOnline).toBe(false);
  });

  it('PATCH /me/online false blocked when rider has active assignments', async () => {
    const onlineRider = { ...RIDER_ROW, is_online: 1 };
    pool.query
      .mockResolvedValueOnce([[onlineRider]]) // requireRider
      .mockResolvedValueOnce([[{ cnt: 2 }]]); // active jobs

    const res = await request(app)
      .patch('/api/rider/me/online')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ isOnline: false });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toBe('ACTIVE_ASSIGNMENTS');
    expect(res.body.activeCount).toBe(2);
    expect(pool.query.mock.calls.some((c) =>
      String(c[0]).includes('SET is_online = 0')
    )).toBe(false);
  });

  it('PATCH /me/online without boolean -> 400', async () => {
    pool.query.mockResolvedValueOnce([[RIDER_ROW]]);

    const res = await request(app)
      .patch('/api/rider/me/online')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({});

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

});
