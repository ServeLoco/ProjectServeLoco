const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/adminRoutes');
const { pool } = require('../src/db/mysql');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const adminToken = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');

describe('Settings and Offers Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should partially update settings (shop toggle)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }]]) // check existing
      .mockResolvedValueOnce([{}]) // update
      .mockResolvedValueOnce([[{ shop_open: 0 }]]); // return updated

    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ shop_open: false });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.shop_open).toEqual(0);
  });

  it('should get active offer', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, title: 'Test Offer', active: 1 }]]);

    const res = await request(app)
      .get('/api/admin/offers/active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.title).toEqual('Test Offer');
  });

  it('should return null if no offer is active', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no rows

    const res = await request(app)
      .get('/api/admin/offers/active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toBeNull();
  });
});
