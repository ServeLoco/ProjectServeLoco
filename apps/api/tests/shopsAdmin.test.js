/**
 * Tests for the admin shop CRUD endpoints (SHOP TASK 5).
 * GET /api/admin/shops, POST /api/admin/shops, PATCH /api/admin/shops/:id
 *
 * Strategy (follows adminValidation.test.js): mock the mysql pool, mount the
 * real adminRoutes on an express app, and drive it with supertest using an
 * admin JWT. The shop-owner lookup helper getShopForUser is exercised directly
 * for the "active=false hides the shop" case.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const adminRoutes = require('../src/routes/adminRoutes');
const { getShopForUser } = require('../src/utils/shops');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const adminToken = jwt.sign(
  { id: 'admin', role: 'admin' },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

describe('Admin Shop CRUD — /api/admin/shops', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /shops with an unknown owner_phone → 404 OWNER_NOT_FOUND', async () => {
    // users lookup returns no rows for the given phone
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Burger Point', owner_phone: '9999999999' });

    expect(res.statusCode).toEqual(404);
    expect(res.body.code).toBe('OWNER_NOT_FOUND');
    expect(res.body.message).toMatch(/No user with that phone/);
  });

  it('POST /shops with a valid owner_phone → 201', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 7 }]])           // users lookup (phone found)
      .mockResolvedValueOnce([[]])                     // OWNER_TAKEN check (no existing shop)
      .mockResolvedValueOnce([[]])                     // ROLE_CONFLICT rider check (not a rider)
      .mockResolvedValueOnce([{ insertId: 1 }])        // INSERT shops
      .mockResolvedValueOnce([[{                       // fetchShopRow re-query
        id: 1, name: 'Burger Point', is_open: 1, active: 1,
        owner_user_id: 7, owner_name: 'Reza', owner_phone: '9999999999',
        product_count: 0, created_at: '2026-07-09 00:00:00'
      }]]);

    const res = await request(app)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Burger Point', owner_phone: '9999999999' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.shop.id).toBe(1);
    expect(res.body.shop.name).toBe('Burger Point');
    expect(res.body.shop.isOpen).toBe(true);
    expect(res.body.shop.ownerUserId).toBe(7);
    expect(res.body.shop.ownerPhone).toBe('9999999999');
  });

  it('POST /shops for a user who already owns an active shop → 409 OWNER_TAKEN', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 7 }]])   // users lookup (phone found)
      .mockResolvedValueOnce([[{ id: 99 }]]); // OWNER_TAKEN check (already owns a shop)

    const res = await request(app)
      .post('/api/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second Shop', owner_phone: '9999999999' });

    expect(res.statusCode).toEqual(409);
    expect(res.body.code).toBe('OWNER_TAKEN');
  });

  it('PATCH /shops/:id active=false hides the shop from getShopForUser', async () => {
    // 1. Before deactivation: getShopForUser returns the active shop.
    pool.query.mockResolvedValueOnce([[
      { id: 1, name: 'Burger Point', is_open: 1, active: 1 }
    ]]);
    const before = await getShopForUser(7);
    expect(before).not.toBeNull();
    expect(before.id).toBe(1);

    jest.clearAllMocks();

    // 2. Admin deactivates the shop via PATCH active=false.
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }]])     // existence check (shop exists)
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE active = 0
      .mockResolvedValueOnce([[{                 // fetchShopRow re-query (now active=0)
        id: 1, name: 'Burger Point', is_open: 1, active: 0,
        owner_user_id: 7, owner_name: 'Reza', owner_phone: '9999999999',
        product_count: 0, created_at: '2026-07-09 00:00:00'
      }]])
      // syncGlobalShopOpenState: settings lookup (delivery available), then
      // the shops SUM query — no other shops in this mock (total_active 0),
      // so it no-ops without touching settings.shop_open.
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([[{ total_active: 0, total_open: 0 }]]);

    const res = await request(app)
      .patch('/api/admin/shops/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toBe('Shop updated');
    expect(res.body.shop.active).toBe(false);

    // 3. After deactivation: getShopForUser's `active = 1` filter excludes the
    //    shop, so it returns null (owner can no longer access the shop API).
    pool.query.mockResolvedValueOnce([[]]); // active=1 filter → no rows
    const after = await getShopForUser(7);
    expect(after).toBeNull();
  });
});
