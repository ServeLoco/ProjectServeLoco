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
const tokenFor = (claims) => jwt.sign(claims, process.env.JWT_SECRET || 'secret');
const adminToken = tokenFor({ id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 1 });
const superToken = tokenFor({ id: 'super', role: 'admin', adminRole: 'super_admin', areaId: null });

describe('Admin order list customer delivered history', () => {
  beforeEach(() => pool.query.mockReset().mockResolvedValue([[]]));

  it('batches unique page customers, counts only Delivered across all dates, and preserves area scope', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 24 }]])
      .mockResolvedValueOnce([[
        { id: 10, customer_id: 7, status: 'Pending' },
        { id: 11, customer_id: 7, status: 'Cancelled' },
        { id: 12, customer_id: 8, status: 'Pending' },
      ]])
      .mockResolvedValueOnce([[]]) // item previews
      .mockResolvedValueOnce([[{ customer_id: 7, delivered_order_count: '16' }]]);

    const res = await request(app)
      .get('/api/admin/orders?status=Pending&today=1&page=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((row) => row.customerDeliveredOrderCount)).toEqual([16, 16, 0]);
    expect(res.body.data.map((row) => row.customer_delivered_order_count)).toEqual([16, 16, 0]);
    expect(res.body.pagination).toMatchObject({ total: 24, page: 2 });
    expect(pool.query).toHaveBeenCalledTimes(4);
    const [sql, params] = pool.query.mock.calls[3];
    expect(sql).toContain("o.status = 'Delivered'");
    expect(sql).toContain('o.area_id = ?');
    expect(sql).toContain('GROUP BY o.customer_id');
    expect(sql).not.toMatch(/created_at|LIMIT|OFFSET/);
    expect(params).toEqual([[7, 8], 1]);
  });

  it('allows the super admin all-area roll-up to count delivered orders across areas', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 10, customer_id: 7 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ customer_id: 7, delivered_order_count: 6 }]]);

    const res = await request(app).get('/api/admin/orders')
      .set('Authorization', `Bearer ${superToken}`).set('X-Area-Id', 'all');

    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].customerDeliveredOrderCount).toBe(6);
    const [sql, params] = pool.query.mock.calls[3];
    expect(sql).not.toContain('area_id');
    expect(params).toEqual([[7]]);
  });

  it('skips history queries when the order page is empty', async () => {
    pool.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    const res = await request(app).get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('denies customers access to the admin history endpoint', async () => {
    const customerToken = tokenFor({ id: 7, role: 'customer' });
    const res = await request(app).get('/api/admin/orders')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.statusCode).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
