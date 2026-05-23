const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/adminRoutes');
const productRoutes = require('../src/routes/productRoutes');
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
app.use('/api/products', productRoutes);

// Admin token for testing
const token = jwt.sign({ id: 'admin', role: 'admin' }, process.env.JWT_SECRET || 'secret');

describe('Product and Category Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a category', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert category

    const res = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Snacks',
        slug: 'snacks',
        type: 'packed',
        active: true
      });

    expect(res.statusCode).toEqual(201);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('should create a product', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert product

    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Chips',
        price: 20,
        categoryId: 1,
        unit: 'packet',
        description: 'Crispy chips',
        available: true
      });

    expect(res.statusCode).toEqual(201);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('should fetch products', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Chips' }]]); // select products
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'Snacks' }]]); // select categories

    const res = await request(app).get('/api/products');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.products).toHaveLength(1);
  });
});
