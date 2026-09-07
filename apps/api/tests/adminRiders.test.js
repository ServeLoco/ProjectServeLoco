/**
 * TASK 9 — admin riders CRUD + mutual exclusion with shop owners.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToAllCustomers: jest.fn(),
}));
jest.mock('../src/utils/shops', () => ({
  syncAreaShopOpenState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/controllers/settingsController', () => ({
  bustSettingsCache: jest.fn(),
}));

const adminRoutes = require('../src/routes/adminRoutes');
const { pool } = require('../src/db/mysql');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const adminToken = () => jwt.sign(
  { id: 'admin-1', role: 'admin', adminRole: 'area_admin', areaId: 1 },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

describe('Admin riders API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('lists riders', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 1, user_id: 5, display_name: 'Ravi', phone: '999',
      active: 1, is_online: 0, last_heartbeat_at: null, created_at: null,
      user_name: 'Ravi', user_phone: '999',
    }]]);

    const res = await request(app)
      .get('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.riders).toHaveLength(1);
    expect(res.body.riders[0].displayName).toBe('Ravi');
  });

  it('create rider fails if user is shop owner', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'X', phone: '999' }]]) // user by phone
      .mockResolvedValueOnce([[{ id: 1 }]]); // owns shop

    const res = await request(app)
      .post('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ phone: '999' });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ROLE_CONFLICT');
  });

  it('create rider succeeds', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'Ravi', phone: '999' }]])
      .mockResolvedValueOnce([[]]) // not shop owner
      .mockResolvedValueOnce([[]]) // not already rider
      .mockResolvedValueOnce([{ insertId: 3 }])
      .mockResolvedValueOnce([[{
        id: 3, user_id: 5, display_name: 'Ravi', phone: '999',
        active: 1, is_online: 0, last_heartbeat_at: null, created_at: null,
        user_name: 'Ravi', user_phone: '999',
      }]]);

    const res = await request(app)
      .post('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ phone: '999', displayName: 'Ravi' });

    expect(res.statusCode).toBe(201);
    expect(res.body.rider.id).toBe(3);
  });

  it('create rider fails if user is an active mobile admin', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'Ravi', phone: '9999999999' }]]) // user by phone
      .mockResolvedValueOnce([[]]) // not shop owner
      .mockResolvedValueOnce([[{ id: 2 }]]); // active mobile admin for this phone

    const res = await request(app)
      .post('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ phone: '9999999999' });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ROLE_CONFLICT');
  });

  it('create rider stores a custom maxActiveOrders', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'Ravi', phone: '999' }]])
      .mockResolvedValueOnce([[]]) // not shop owner
      .mockResolvedValueOnce([[]]) // not already rider
      .mockResolvedValueOnce([{ insertId: 3 }])
      .mockResolvedValueOnce([[{
        id: 3, user_id: 5, display_name: 'Ravi', phone: '999',
        active: 1, is_online: 0, max_active_orders: 5, last_heartbeat_at: null, created_at: null,
        user_name: 'Ravi', user_phone: '999',
      }]]);

    const res = await request(app)
      .post('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ phone: '999', displayName: 'Ravi', maxActiveOrders: 5 });

    expect(res.statusCode).toBe(201);
    expect(res.body.rider.maxActiveOrders).toBe(5);
    const insertCall = pool.query.mock.calls[3];
    expect(insertCall[0]).toContain('max_active_orders');
    expect(insertCall[1]).toContain(5);
  });

  it('create rider rejects a non-integer maxActiveOrders without touching the DB', async () => {
    const res = await request(app)
      .post('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ phone: '999', maxActiveOrders: 2.5 });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('create rider rejects a maxActiveOrders above the cap', async () => {
    const res = await request(app)
      .post('/api/admin/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ phone: '999', maxActiveOrders: 999 });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('patch updates maxActiveOrders alone', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        id: 3, user_id: 5, display_name: 'Ravi', phone: '999', active: 1, is_online: 1,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{
        id: 3, user_id: 5, display_name: 'Ravi', phone: '999', active: 1, is_online: 1,
        max_active_orders: 1, last_heartbeat_at: null, created_at: null, user_name: 'Ravi', user_phone: '999',
      }]]);

    const res = await request(app)
      .patch('/api/admin/riders/3')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ maxActiveOrders: 1 });

    expect(res.statusCode).toBe(200);
    expect(res.body.rider.maxActiveOrders).toBe(1);
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toContain('max_active_orders = ?');
  });

  it('patch rejects maxActiveOrders of 0', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 3, user_id: 5, display_name: 'Ravi', phone: '999', active: 1, is_online: 1,
    }]]);

    const res = await request(app)
      .patch('/api/admin/riders/3')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ maxActiveOrders: 0 });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('patch deactivates rider', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        id: 3, user_id: 5, display_name: 'Ravi', phone: '999', active: 1, is_online: 1,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      // syncDeliveryAvailabilityFromRiders
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // bumpCatalogVersion's UPDATE areas (bug fix #8)
      .mockResolvedValueOnce([[{
        id: 3, user_id: 5, display_name: 'Ravi', phone: '999', active: 0, is_online: 0,
        last_heartbeat_at: null, created_at: null, user_name: 'Ravi', user_phone: '999',
      }]]);

    const res = await request(app)
      .patch('/api/admin/riders/3')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ active: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.rider.active).toBe(false);
  });
});
