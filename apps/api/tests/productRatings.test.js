/**
 * The rating a product card shows (utils/productRatings.js) and the customer
 * endpoint that serves it (GET /api/products/ratings).
 */
const request = require('supertest');
const express = require('express');
const { pool } = require('../src/db/mysql');
const { shownRating, isFire, clearProductRatingsCache } = require('../src/utils/productRatings');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('express-rate-limit', () => {
  const factory = () => (req, res, next) => next();
  factory.rateLimit = factory;
  factory.ipKeyGenerator = (ip) => String(ip);
  return factory;
});
// Pin -> area is covered elsewhere; here the area comes straight from ?area.
jest.mock('../src/middleware/areaMiddleware', () => ({
  resolveCustomerArea: (req, res, next) => {
    req.areaId = req.query.area ? Number(req.query.area) : null;
    next();
  },
}));

const productRoutes = require('../src/routes/productRoutes');

const app = express();
app.use('/api/products', productRoutes);

describe('shownRating', () => {
  it('counts unrated order lines as 5 stars', () => {
    // 400 orders, two 1-star ratings: (398 x 5 + 1 + 1) / 400 = 4.98 -> 5.0
    expect(shownRating(400, 8)).toBe(5);
    // 4 orders, ratings 1 and 4: (5 + 5 + 1 + 4) / 4 = 3.75 -> 3.8
    expect(shownRating(4, 5)).toBe(3.8);
  });

  it('never goes below 3.5', () => {
    expect(shownRating(1, 4)).toBe(3.5); // one 1-star rating
    expect(shownRating(3, 12)).toBe(3.5); // three 1-star ratings
  });

  it('has no rating without a delivered order', () => {
    expect(shownRating(0, 0)).toBeNull();
  });

  it('shows fire above 4.8 on the rounded value', () => {
    expect(isFire(4.9)).toBe(true);
    expect(isFire(5)).toBe(true);
    expect(isFire(4.8)).toBe(false);
    expect(isFire(null)).toBe(false);
    // 20 orders, one 2-star rating: 4.85 -> 4.9 -> fire
    expect(isFire(shownRating(20, 3))).toBe(true);
  });
});

describe('GET /api/products/ratings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
    clearProductRatingsCache();
  });

  it("returns the area's card ratings in both casings", async () => {
    pool.query.mockResolvedValueOnce([[
      { item_type: 'product', product_id: 7, orders_count: 2, stars_missing: '3' },
      { item_type: 'combo', product_id: 4, orders_count: 10, stars_missing: '0' },
    ]]);

    const res = await request(app).get('/api/products/ratings?area=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.areaId).toBe(1);
    expect(res.body.data.area_id).toBe(1);
    expect(res.body.data.items).toEqual([
      {
        itemType: 'product', item_type: 'product', productId: 7, product_id: 7,
        rating: 3.5, fire: false, ordersCount: 2, orders_count: 2,
      },
      {
        itemType: 'combo', item_type: 'combo', productId: 4, product_id: 4,
        rating: 5, fire: true, ordersCount: 10, orders_count: 10,
      },
    ]);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE o\.area_id = \? AND o\.status = 'Delivered'/);
    expect(sql).toMatch(/LEFT JOIN order_item_ratings r ON r\.order_item_id = oi\.id AND r\.area_id = oi\.area_id/);
    expect(params).toEqual([1]);
  });

  it('serves a repeat request from the cache', async () => {
    pool.query.mockResolvedValue([[]]);

    await request(app).get('/api/products/ratings?area=1');
    await request(app).get('/api/products/ratings?area=1');

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('returns no items when the area is unknown', async () => {
    const res = await request(app).get('/api/products/ratings');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('is not read as a product id', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/api/products/ratings?area=2');

    expect(res.statusCode).toBe(200);
    expect(pool.query.mock.calls[0][0]).toMatch(/order_item_ratings/);
  });
});
