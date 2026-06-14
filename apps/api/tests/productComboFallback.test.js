const request = require('supertest');
const express = require('express');
const productRoutes = require('../src/routes/productRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

const app = express();
app.use(express.json());
app.use('/api/products', productRoutes);

describe('Product Combo Fallback', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should return 404 when product is not found and type=combo is not specified', async () => {
    // Return empty for product
    pool.query.mockResolvedValueOnce([[]]);
    
    const res = await request(app).get('/api/products/1');
    expect(res.statusCode).toEqual(404);
    expect(res.body.message).toEqual('Product not found');
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('FROM products');
  });

  it('should load combo when type=combo is specified', async () => {
    // Return combo for combo
    pool.query.mockResolvedValueOnce([[{ id: 1, name: 'My Combo' }]]);
    // Resolve images and items mock
    pool.query.mockResolvedValueOnce([[]]);
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/api/products/1?type=combo');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.name).toEqual('My Combo');
    expect(pool.query.mock.calls[0][0]).toContain('FROM combos');
  });
});
