const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/adminRoutes');
const { pool } = require('../src/db/mysql');
const authMiddleware = require('../src/middleware/authMiddleware');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));
jest.mock('../src/middleware/authMiddleware', () => ({
  requireAdmin: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Top Items Report', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('should group top items by product_id and item_type', async () => {
    pool.query.mockResolvedValueOnce([
      [
        { product_id: 1, item_type: 'product', product_name: 'Apple', total_quantity: 10, total_sales: 100 },
        { product_id: 1, item_type: 'combo', product_name: 'Apple Combo', total_quantity: 5, total_sales: 50 },
      ]
    ]);

    const res = await request(app).get('/api/admin/reports/top-products?period=today');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveLength(2);
    expect(pool.query.mock.calls[0][0]).toContain('GROUP BY oi.product_id, oi.item_type, oi.product_name');
  });
});
