/**
 * Tests for shop-owner product groups (SHOP V2 TASK 5) - /api/shop/groups.
 * Same mock strategy as shopOwner.test.js.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const shopRoutes = require('../src/routes/shopRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToAdmins: jest.fn(),
  emitToCustomer: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/shop', shopRoutes);

const customerToken = (id = 7) => jwt.sign(
  { id, role: 'customer' },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

const SHOP_ROW = [{ id: 1, name: 'Burger Point', is_open: 1, active: 1 }];

describe('Shop-owner product groups - /api/shop/groups', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /groups returns this shop\'s groups with member counts', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW]) // requireShopOwner lookup
      .mockResolvedValueOnce([[
        { id: 1, name: 'Starters', active: 1, product_count: 3 },
        { id: 2, name: 'Mains', active: 0, product_count: 0 },
      ]]);

    const res = await request(app)
      .get('/api/shop/groups')
      .set('Authorization', `Bearer ${customerToken(7)}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups[0]).toEqual(expect.objectContaining({
      id: 1, name: 'Starters', active: true, isActive: true, productCount: 3, product_count: 3,
    }));
    expect(res.body.groups[1].active).toBe(false);
  });

  it('POST /groups with blank name -> 400 VALIDATION_ERROR', async () => {
    pool.query.mockResolvedValueOnce([SHOP_ROW]); // requireShopOwner lookup

    const res = await request(app)
      .post('/api/shop/groups')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ name: '  ' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /groups creates a group scoped to this shop', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW])                 // requireShopOwner lookup
      .mockResolvedValueOnce([{ insertId: 5 }])          // INSERT
      .mockResolvedValueOnce([[{ id: 5, name: 'Starters', active: 1, product_count: 0 }]]); // re-select

    const res = await request(app)
      .post('/api/shop/groups')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ name: 'Starters' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.group).toEqual(expect.objectContaining({ id: 5, name: 'Starters', active: true }));
  });

  it('PATCH /groups/:id 404s when the group belongs to another shop', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW]) // requireShopOwner lookup
      .mockResolvedValueOnce([[]]);      // existence check scoped to shop_id=1 -> not found

    const res = await request(app)
      .patch('/api/shop/groups/999')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ active: false });

    expect(res.statusCode).toEqual(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('DELETE /groups/:id ungroups member products then deletes the group', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW])          // requireShopOwner lookup
      .mockResolvedValueOnce([[{ id: 1 }]])       // existence check
      .mockResolvedValueOnce([{ affectedRows: 3 }]) // UPDATE products SET group_id = NULL
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE FROM product_groups

    const res = await request(app)
      .delete('/api/shop/groups/1')
      .set('Authorization', `Bearer ${customerToken(7)}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toBe('Group deleted');
    expect(pool.query).toHaveBeenNthCalledWith(3,
      'UPDATE products SET group_id = NULL WHERE group_id = ?', ['1']);
  });

  it("PATCH /products/:id/group -> 400 when group_id belongs to another shop", async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW]) // requireShopOwner lookup
      .mockResolvedValueOnce([[]]);      // group lookup scoped to shop_id=1 -> not found

    const res = await request(app)
      .patch('/api/shop/products/42/group')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ group_id: 999 });

    expect(res.statusCode).toEqual(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /products/:id/group assigns a valid group and clears with null', async () => {
    pool.query
      .mockResolvedValueOnce([SHOP_ROW])             // requireShopOwner lookup
      .mockResolvedValueOnce([[{ id: 1 }]])          // group lookup ok
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE products

    const res = await request(app)
      .patch('/api/shop/products/42/group')
      .set('Authorization', `Bearer ${customerToken(7)}`)
      .send({ group_id: 1 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toBe('Product group updated');
  });
});
