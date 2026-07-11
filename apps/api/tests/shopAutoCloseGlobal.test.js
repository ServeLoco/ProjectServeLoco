/**
 * Tests for autoCloseGlobalShopIfAllShopsClosed (src/utils/shops.js) and its
 * wiring into the two shop is_open/active toggle paths:
 *   - PATCH /api/shop/me/toggle       (shopOwnerController.toggleMyShop)
 *   - PATCH /api/admin/shops/:id      (shopAdminController.updateShop)
 *
 * Behavior is intentionally one-directional: when the last active shop
 * closes, settings.shop_open auto-flips to 0. Opening a shop back up never
 * auto-reopens the global banner — that always requires an explicit admin
 * action (confirmed product decision, not an oversight).
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/db/mysql');
const { autoCloseGlobalShopIfAllShopsClosed } = require('../src/utils/shops');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
  emitToAllCustomers: jest.fn(),
  emitToCustomer: jest.fn(),
}));

describe('autoCloseGlobalShopIfAllShopsClosed (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('closes the global settings.shop_open when zero active shops are open', async () => {
    pool.query.mockResolvedValueOnce([[{ total_active: 3, total_open: 0 }]]);

    await autoCloseGlobalShopIfAllShopsClosed();

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenNthCalledWith(2, 'UPDATE settings SET shop_open = 0 WHERE shop_open = 1');
  });

  it('does nothing when at least one active shop is still open', async () => {
    pool.query.mockResolvedValueOnce([[{ total_active: 3, total_open: 1 }]]);

    await autoCloseGlobalShopIfAllShopsClosed();

    expect(pool.query).toHaveBeenCalledTimes(1); // only the SUM query, no UPDATE
  });

  it('does nothing in single-vendor deployments (no active shops at all)', async () => {
    pool.query.mockResolvedValueOnce([[{ total_active: 0, total_open: 0 }]]);

    await autoCloseGlobalShopIfAllShopsClosed();

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('swallows DB errors without throwing', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(autoCloseGlobalShopIfAllShopsClosed()).resolves.toBeUndefined();
  });
});

describe('toggleMyShop wiring — PATCH /api/shop/me/toggle', () => {
  const shopRoutes = require('../src/routes/shopRoutes');
  const app = express();
  app.use(express.json());
  app.use('/api/shop', shopRoutes);

  const customerToken = jwt.sign(
    { id: 7, role: 'customer' },
    process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
  );
  const SHOP_ROW = [{ id: 1, name: 'Burger Point', is_open: 1, active: 1 }];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('closing the last open shop triggers the global auto-close check', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW])              // requireShopOwner lookup
      .mockResolvedValueOnce([[{ cnt: 0 }]])           // active-orders guard
      .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE shops SET is_open = 0
      .mockResolvedValueOnce([[{ id: 1, name: 'Burger Point', is_open: 0, active: 1 }]]) // re-select
      .mockResolvedValueOnce([[{ total_active: 1, total_open: 0 }]]) // autoClose SUM
      .mockResolvedValueOnce([{ affectedRows: 1 }]);   // autoClose UPDATE settings

    const res = await request(app)
      .patch('/api/shop/me/toggle')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ is_open: false });

    expect(res.statusCode).toEqual(200);
    expect(pool.query).toHaveBeenLastCalledWith('UPDATE settings SET shop_open = 0 WHERE shop_open = 1');
  });

  it('opening a shop never triggers the auto-close check (no auto-reopen)', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW])              // requireShopOwner lookup
      .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE shops SET is_open = 1
      .mockResolvedValueOnce([[{ id: 1, name: 'Burger Point', is_open: 1, active: 1 }]]); // re-select

    const res = await request(app)
      .patch('/api/shop/me/toggle')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ is_open: true });

    expect(res.statusCode).toEqual(200);
    // Exactly the 3 calls above — no extra SUM/UPDATE settings query fired.
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});

describe('updateShop wiring — PATCH /api/admin/shops/:id', () => {
  const adminRoutes = require('../src/routes/adminRoutes');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const adminToken = jwt.sign(
    { id: 'admin', role: 'admin' },
    process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setting is_open=false triggers the global auto-close check', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }]])            // existence check
      .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE shops SET is_open = 0
      .mockResolvedValueOnce([[{                        // fetchShopRow re-query
        id: 1, name: 'Burger Point', is_open: 0, active: 1,
        owner_user_id: 7, owner_name: 'Reza', owner_phone: '9999999999',
        product_count: 0, created_at: '2026-07-09 00:00:00'
      }]])
      .mockResolvedValueOnce([[{ total_active: 1, total_open: 0 }]]) // autoClose SUM
      .mockResolvedValueOnce([{ affectedRows: 1 }]);   // autoClose UPDATE settings

    const res = await request(app)
      .patch('/api/admin/shops/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_open: false });

    expect(res.statusCode).toEqual(200);
    expect(pool.query).toHaveBeenLastCalledWith('UPDATE settings SET shop_open = 0 WHERE shop_open = 1');
  });

  it('setting is_open=true never triggers the auto-close check', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }]])            // existence check
      .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE shops SET is_open = 1
      .mockResolvedValueOnce([[{                        // fetchShopRow re-query
        id: 1, name: 'Burger Point', is_open: 1, active: 1,
        owner_user_id: 7, owner_name: 'Reza', owner_phone: '9999999999',
        product_count: 0, created_at: '2026-07-09 00:00:00'
      }]]);

    const res = await request(app)
      .patch('/api/admin/shops/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_open: true });

    expect(res.statusCode).toEqual(200);
    expect(pool.query).toHaveBeenCalledTimes(3); // no SUM/UPDATE settings query fired
  });
});
