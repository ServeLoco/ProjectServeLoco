const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/adminRoutes');
const authRoutes = require('../src/routes/authRoutes');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn()
  }
}));

jest.mock('../src/db/mongodb', () => {
  const insertOne = jest.fn(() => Promise.resolve());
  return {
    __mockInsertOne: insertOne,
    getDb: jest.fn(() => ({
      collection: jest.fn(() => ({ insertOne }))
    }))
  };
});

const { __mockInsertOne } = require('../src/db/mongodb');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

const adminToken = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');
const customerToken = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describe('Order Cancellation and Admin Action Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow customer to cancel a pending order', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1001, status: 'Pending', customer_id: 1 }]]) // check order
      .mockResolvedValueOnce([{}]); // update order

    const res = await request(app)
      .patch('/api/orders/1001/cancel')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toContain('cancelled');
  });

  it('should not allow customer to cancel a preparing order', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1001, status: 'Preparing', customer_id: 1 }]]);

    const res = await request(app)
      .patch('/api/orders/1001/cancel')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toEqual(400);
  });

  it('should update admin order status without runtime DDL', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1001, status: 'Pending', customer_id: 1 }]]) // check existing
      .mockResolvedValueOnce([{}]) // update
      .mockResolvedValueOnce([[{ id: 1001, status: 'Accepted', customer_id: 1 }]]); // return updated

    const res = await request(app)
      .patch('/api/admin/orders/1001/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Accepted' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.order.status).toEqual('Accepted');
    
    // Ensure ALTER TABLE was not called
    pool.query.mock.calls.forEach(call => {
      expect(call[0]).not.toMatch(/ALTER TABLE/i);
    });
  });

  it('should block a customer', async () => {
    pool.query.mockResolvedValueOnce([{}]); // update block

    const res = await request(app)
      .put('/api/admin/customers/1/block')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ blocked: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toContain('blocked');
  });

  it('should allow customer to request a password reset with a hashed pending password', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ insertId: 7 }]);

    const res = await request(app)
      .post('/api/auth/password-reset-requests')
      .send({ phone: '9999999999', newPassword: 'TempPass123' });

    expect(res.statusCode).toEqual(202);
    expect(res.body.message).toContain('admin approval');
    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO password_reset_requests (user_id, password_hash) VALUES (?, ?)',
      [1, expect.stringMatching(/^\$2[aby]\$/)]
    );
  });

  it('should allow admin to approve a pending password reset request', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 7, user_id: 1, password_hash: '$2b$10$hashed', status: 'pending' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .patch('/api/admin/password-reset-requests/7/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toContain('approved');
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      ['$2b$10$hashed', 1]
    );
    expect(__mockInsertOne).toHaveBeenCalledWith(expect.objectContaining({
      body: {}
    }));
  });

  it('should aggregate admin stats', async () => {
    pool.query
      .mockResolvedValueOnce([[{ totalSales: 500, totalOrders: 5, pendingOrders: 2 }]]) // orders stats
      .mockResolvedValueOnce([[{ totalProducts: 10 }]]) // products
      .mockResolvedValueOnce([[{ totalCustomers: 50 }]]) // customers
      .mockResolvedValueOnce([[{ totalCategories: 5 }]]); // categories

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.sales.totalSales).toEqual(500);
  });
});
