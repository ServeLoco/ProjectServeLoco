const request = require('supertest');
const express = require('express');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');
const jwt = require('jsonwebtoken');

// Mock the MySQL pool. getOrders uses pool.query twice (rows + count) and
// never opens a transaction, so we only need to mock query here. Keeping the
// mock narrow makes the assertions on call args readable below.
jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Defensive: GET /api/orders is not rate-limited today, but the POST route
// pulls in express-rate-limit. If any future refactor adds a GET limiter
// (per-IP, etc.) we don't want the test suite to silently start throttling.
// Pass-through so behavior under test stays the controller's logic only.
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

// requireCustomer short-circuits the user lookup when NODE_ENV === 'test'
// (see authMiddleware.js), so a signed JWT is enough to authenticate.
const token = jwt.sign(
  { id: 1, role: 'customer' },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

const CUSTOMER_ID = 1;

// Build N mock order rows. created_at decreases so ORDER BY created_at DESC
// yields rows[0] first; using new Date(Date.now() - i*60_000) gives a
// stable, monotonically-descending sequence regardless of test ordering.
const buildOrderRows = (n, startId = 1) => {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: startId + i,
      order_number: `OD-20260705-${String(startId + i).padStart(4, '0')}`,
      customer_id: CUSTOMER_ID,
      status: 'Pending',
      payment_status: 'Pending',
      subtotal: 100,
      delivery_charge: 0,
      night_charge: 0,
      discount: 0,
      total: 100,
      address: '123 Test St',
      created_at: new Date(Date.now() - i * 60_000),
    });
  }
  return rows;
};

// Queue the two pool.query responses that getOrders issues:
//   1) SELECT ... LIMIT ? OFFSET ?  -> rows
//   2) SELECT COUNT(*) ...         -> [{ total }]
const mockGetOrdersQuery = (pageRows, total) => {
  pool.query
    .mockResolvedValueOnce([pageRows])
    .mockResolvedValueOnce([[{ total }]]);
};

describe('GET /api/orders pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the first page (20 rows) with hasMore=true when 25 orders exist', async () => {
    const allRows = buildOrderRows(25);
    // Controller sends LIMIT 20 OFFSET 0; the mock returns the first 20.
    mockGetOrdersQuery(allRows.slice(0, 20), 25);

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.meta).toEqual({
      total: 25,
      limit: 20,
      offset: 0,
      hasMore: true,
    });

    // Verify the controller clamped nothing (defaults applied) and
    // pushed those values through to MySQL.
    expect(pool.query).toHaveBeenCalledTimes(2);
    const rowsCallArgs = pool.query.mock.calls[0];
    expect(rowsCallArgs[1]).toEqual([CUSTOMER_ID, 20, 0]);
    expect(rowsCallArgs[0]).toMatch(/LIMIT \? OFFSET \?/);
  });

  it('returns the last page (5 rows) with hasMore=false when offset=20', async () => {
    const allRows = buildOrderRows(25);
    // Controller sends LIMIT 20 OFFSET 20; the mock returns the tail.
    mockGetOrdersQuery(allRows.slice(20), 25);

    const res = await request(app)
      .get('/api/orders?offset=20')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta).toEqual({
      total: 25,
      limit: 20,
      offset: 20,
      hasMore: false,
    });

    const rowsCallArgs = pool.query.mock.calls[0];
    expect(rowsCallArgs[1]).toEqual([CUSTOMER_ID, 20, 20]);
  });

  it('clamps limit=100 down to 50 when 60 orders exist', async () => {
    const allRows = buildOrderRows(60);
    // Controller clamps limit to 50; mock returns the clamped page size.
    mockGetOrdersQuery(allRows.slice(0, 50), 60);

    const res = await request(app)
      .get('/api/orders?limit=100')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(50);
    expect(res.body.meta).toEqual({
      total: 60,
      limit: 50,
      offset: 0,
      hasMore: true,
    });

    // The clamped limit must reach MySQL — not the raw ?limit=100.
    const rowsCallArgs = pool.query.mock.calls[0];
    expect(rowsCallArgs[1]).toEqual([CUSTOMER_ID, 50, 0]);
  });

  it('clamps a negative offset up to 0 and returns the first page', async () => {
    const allRows = buildOrderRows(25);
    mockGetOrdersQuery(allRows.slice(0, 20), 25);

    const res = await request(app)
      .get('/api/orders?offset=-10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.meta).toEqual({
      total: 25,
      limit: 20,
      offset: 0,
      hasMore: true,
    });

    const rowsCallArgs = pool.query.mock.calls[0];
    expect(rowsCallArgs[1]).toEqual([CUSTOMER_ID, 20, 0]);
  });

  it('walks pages of 5 with offset=0 then offset=5 against 25 orders', async () => {
    const allRows = buildOrderRows(25);

    // Page 1: ?limit=5&offset=0
    mockGetOrdersQuery(allRows.slice(0, 5), 25);
    const resPage1 = await request(app)
      .get('/api/orders?limit=5&offset=0')
      .set('Authorization', `Bearer ${token}`);
    expect(resPage1.statusCode).toBe(200);
    expect(resPage1.body.data).toHaveLength(5);
    expect(resPage1.body.meta).toEqual({
      total: 25,
      limit: 5,
      offset: 0,
      hasMore: true,
    });

    // Page 2: ?limit=5&offset=5
    mockGetOrdersQuery(allRows.slice(5, 10), 25);
    const resPage2 = await request(app)
      .get('/api/orders?limit=5&offset=5')
      .set('Authorization', `Bearer ${token}`);
    expect(resPage2.statusCode).toBe(200);
    expect(resPage2.body.data).toHaveLength(5);
    expect(resPage2.body.meta).toEqual({
      total: 25,
      limit: 5,
      offset: 5,
      hasMore: true,
    });

    // The two pages must be different rows — IDs should not overlap.
    const page1Ids = resPage1.body.data.map((o) => o.id);
    const page2Ids = resPage2.body.data.map((o) => o.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toEqual([]);

    // Each request must pass the correct (limit, offset) to MySQL.
    // mock.calls[0..1] are page 1's rows+count; [2..3] are page 2's.
    expect(pool.query.mock.calls[0][1]).toEqual([CUSTOMER_ID, 5, 0]);
    expect(pool.query.mock.calls[2][1]).toEqual([CUSTOMER_ID, 5, 5]);
  });
});
