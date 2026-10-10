const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const adminRoutes = require('../src/routes/adminRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));

const app = express();
app.use('/api/admin', adminRoutes);
const adminToken = jwt.sign(
  { id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 2 },
  process.env.JWT_SECRET || 'secret'
);
const listOrders = () => request(app).get('/api/admin/orders')
  .set('Authorization', `Bearer ${adminToken}`);

beforeEach(() => pool.query.mockReset().mockResolvedValue([[]]));

it('returns each saved rating on its own order line, preserving unrated items and billing fields', async () => {
  const itemRows = [
    { id: 101, order_id: 10, product_name: 'Pizza', quantity: 1, line_total: 100, shop_billable: 1, customer_rating: '1' },
    { id: 102, order_id: 10, product_name: 'Pizza', quantity: 2, line_total: 200, shop_billable: 1, customer_rating: 5 },
    { id: 103, order_id: 11, product_name: 'Drink', quantity: 1, line_total: 20, shop_rejected_at: '2026-10-10', shop_billable: 0, customer_rating: null },
  ];
  pool.query
    .mockResolvedValueOnce([[{ total: 2 }]])
    .mockResolvedValueOnce([[{ id: 10 }, { id: 11 }]])
    .mockResolvedValueOnce([itemRows]);

  const res = await listOrders();

  expect(res.statusCode).toBe(200);
  expect(res.body.data[0].items).toEqual(itemRows.slice(0, 2).map((item) => ({
    ...item, customerRating: Number(item.customer_rating), customer_rating: Number(item.customer_rating),
  })));
  expect(res.body.data[1].items).toEqual([{ ...itemRows[2], customerRating: null }]);
  expect(res.body.pagination.total).toBe(2);
  // One batched left join, rather than a query per item. The order list keeps
  // its area boundary and the rating join also requires the item's area.
  expect(pool.query).toHaveBeenCalledTimes(3);
  expect(pool.query.mock.calls[1][0]).toContain('o.area_id = ?');
  expect(pool.query.mock.calls[1][1][0]).toBe(2);
  const [sql, params] = pool.query.mock.calls[2];
  expect(sql).toContain('LEFT JOIN order_item_ratings r');
  expect(sql).toContain('r.order_item_id = oi.id AND r.area_id = oi.area_id');
  expect(sql).toContain('ORDER BY oi.id ASC');
  expect(params).toEqual([[10, 11]]);
});

it('returns empty item lists without inventing ratings', async () => {
  pool.query
    .mockResolvedValueOnce([[{ total: 1 }]])
    .mockResolvedValueOnce([[{ id: 10 }]])
    .mockResolvedValueOnce([[]]);
  const res = await listOrders();
  expect(res.statusCode).toBe(200);
  expect(res.body.data[0].items).toEqual([]);
});

it('does not query items or ratings for an empty page', async () => {
  pool.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
  const res = await listOrders();
  expect(res.statusCode).toBe(200);
  expect(res.body.data).toEqual([]);
  expect(pool.query).toHaveBeenCalledTimes(2);
});

it('does not expose admin item ratings to a customer', async () => {
  const token = jwt.sign({ id: 7, role: 'customer' }, process.env.JWT_SECRET || 'secret');
  const res = await request(app).get('/api/admin/orders')
    .set('Authorization', `Bearer ${token}`);
  expect(res.statusCode).toBe(403);
  expect(pool.query).not.toHaveBeenCalled();
});
