const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');

// PATCH /api/orders/:id/items/:itemId/rating issues at most three queries:
//   1) SELECT the order line (+ its order and any saved rating)
//   2) INSERT ... ON DUPLICATE KEY UPDATE the rating
//   3) a first rating only: read back whose stars were kept
jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Pass-through limiters so the tests exercise the controller only (same
// mock as orderPagination.test.js).
jest.mock('express-rate-limit', () => {
  const factory = () => (req, res, next) => next();
  factory.rateLimit = factory;
  factory.ipKeyGenerator = (ip) => String(ip);
  return factory;
});

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

const CUSTOMER_ID = 7;
const token = jwt.sign(
  { id: CUSTOMER_ID, role: 'customer' },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

const SESSION = 'visit-abc12345';
const URL = '/api/orders/40/items/400/rating';

const itemRow = (overrides = {}) => ({
  id: 400,
  area_id: 2,
  item_type: 'product',
  product_id: 55,
  status: 'Delivered',
  rated_stars: null,
  edit_session: null,
  ...overrides,
});

// What step 3 reads back when this visit's write was kept.
const keptRow = (stars) => [[{ stars, edit_session: SESSION }]];

const rate = (body) => request(app)
  .patch(URL)
  .set('Authorization', `Bearer ${token}`)
  .send(body);

describe('PATCH /api/orders/:id/items/:itemId/rating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['0 stars', { stars: 0, editSession: SESSION }],
    ['6 stars', { stars: 6, editSession: SESSION }],
    ['half stars', { stars: 2.5, editSession: SESSION }],
    ['text stars', { stars: 'a', editSession: SESSION }],
    ['boolean stars', { stars: true, editSession: SESSION }],
    ['missing session', { stars: 4 }],
    ['short session', { stars: 4, editSession: 'abc' }],
    ['session with spaces', { stars: 4, editSession: 'visit abc 123' }],
  ])('rejects %s with 400 before touching the database', async (_label, body) => {
    const res = await rate(body);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric item id with 400', async () => {
    const res = await request(app)
      .patch('/api/orders/40/items/abc/rating')
      .set('Authorization', `Bearer ${token}`)
      .send({ stars: 4, editSession: SESSION });
    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('requires a customer token', async () => {
    const res = await request(app).patch(URL).send({ stars: 4, editSession: SESSION });
    expect(res.statusCode).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns 404 for another customer's item (the SELECT is scoped to the caller)", async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await rate({ stars: 4, editSession: SESSION });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/JOIN orders o ON o\.id = oi\.order_id AND o\.customer_id = \?/);
    expect(params).toEqual([CUSTOMER_ID, 400, 40]);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('returns 409 ORDER_NOT_DELIVERED when the order is not delivered yet', async () => {
    pool.query.mockResolvedValueOnce([[itemRow({ status: 'Out for Delivery' })]]);

    const res = await rate({ stars: 4, editSession: SESSION });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ORDER_NOT_DELIVERED');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('saves a first rating and answers in camelCase and snake_case', async () => {
    pool.query
      .mockResolvedValueOnce([[itemRow()]])
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 9 }])
      .mockResolvedValueOnce(keptRow(5));

    const res = await rate({ stars: 5, editSession: SESSION });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      orderId: 40,
      order_id: 40,
      orderItemId: 400,
      order_item_id: 400,
      stars: 5,
      myRating: 5,
      my_rating: 5,
    });
    const [sql, params] = pool.query.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO order_item_ratings/);
    expect(sql).toMatch(/IF\(edit_session = VALUES\(edit_session\), VALUES\(stars\), stars\)/);
    // area_id comes from the order line, never from the client.
    expect(params).toEqual([2, 40, 400, CUSTOMER_ID, 'product', 55, 5, SESSION]);
    const [readSql, readParams] = pool.query.mock.calls[2];
    expect(readSql).toMatch(/FROM order_item_ratings WHERE order_item_id = \? AND area_id = \?/);
    expect(readParams).toEqual([400, 2]);
  });

  it('answers RATING_LOCKED when another visit saved the line first (two phones racing)', async () => {
    pool.query
      .mockResolvedValueOnce([[itemRow()]]) // nothing saved when read
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // the IF kept the other visit's stars
      .mockResolvedValueOnce([[{ stars: 2, edit_session: 'visit-other0001' }]]);

    const res = await rate({ stars: 5, editSession: SESSION });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('RATING_LOCKED');
    expect(res.body.data).toEqual(expect.objectContaining({ stars: 2, myRating: 2 }));
  });

  it('accepts snake_case edit_session and numeric-string stars', async () => {
    pool.query
      .mockResolvedValueOnce([[itemRow()]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce(keptRow(3));

    const res = await rate({ stars: '3', edit_session: SESSION });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.stars).toBe(3);
    expect(pool.query.mock.calls[1][1][6]).toBe(3);
  });

  it('lets the same page visit change its rating', async () => {
    pool.query
      .mockResolvedValueOnce([[itemRow({ rated_stars: 5, edit_session: SESSION })]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const res = await rate({ stars: 3, editSession: SESSION });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.myRating).toBe(3);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('returns 409 RATING_LOCKED with the saved stars for a later visit', async () => {
    pool.query.mockResolvedValueOnce([[itemRow({ rated_stars: 5, edit_session: 'visit-old00001' })]]);

    const res = await rate({ stars: 1, editSession: SESSION });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('RATING_LOCKED');
    expect(res.body.data).toEqual(expect.objectContaining({ stars: 5, myRating: 5, my_rating: 5 }));
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('stores a combo line with its item_type', async () => {
    pool.query
      .mockResolvedValueOnce([[itemRow({ item_type: 'combo', product_id: 12 })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce(keptRow(4));

    const res = await rate({ stars: 4, editSession: SESSION });

    expect(res.statusCode).toBe(200);
    expect(pool.query.mock.calls[1][1].slice(4, 6)).toEqual(['combo', 12]);
  });
});
