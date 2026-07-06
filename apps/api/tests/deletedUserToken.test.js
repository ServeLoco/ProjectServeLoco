const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const orderRoutes = require('../src/routes/orderRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() }
}));

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

// A valid-signature token for a user id that no longer exists. requireCustomer
// runs the `SELECT blocked FROM users WHERE id = ?` lookup only when NODE_ENV
// !== 'test' (the test-env shortcut skips it). To exercise the deleted-user
// branch we run this suite under NODE_ENV='development' (same pattern as
// orderNumber.test.js) so the real auth query path executes.
const deletedUserToken = jwt.sign({ id: 99999, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describe('TASK 8 — reject tokens for deleted users', () => {
  let savedNodeEnv;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  it('returns 401 (not 500) when a valid-signature token has no matching user row', async () => {
    // requireCustomer's SELECT blocked returns no rows → deleted user.
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${deletedUserToken}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toMatch(/no longer valid/i);

    // The auth lookup must be the blocked-check query, keyed on the user id.
    const authCall = pool.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /SELECT blocked FROM users WHERE id = \?/i.test(sql)
    );
    expect(authCall).toBeTruthy();
    expect(authCall[1]).toEqual([99999]);
  });

  it('still returns 403 for a blocked user (unchanged behaviour)', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 1 }]]);

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${deletedUserToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
