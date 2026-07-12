/**
 * ADMIN TASK 15.1 — GET /auth/me attaches `admin` alongside shop/rider.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const authRoutes = require('../src/routes/authRoutes');
const { pool } = require('../src/db/mysql');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const customerToken = (userId) => jwt.sign(
  { sub: userId, role: 'customer' },
  process.env.JWT_SECRET || 'test_jwt_secret_that_is_long_enough'
);

const USER_ROW = {
  id: 1, name: 'Yash', phone: '9999999999', whatsapp_number: null,
  address: null, trusted: 0, blocked: 0, deletion_requested_at: null, created_at: null,
};

describe('GET /auth/me — admin field', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('returns admin: null for a plain customer', async () => {
    pool.query
      .mockResolvedValueOnce([[USER_ROW]]) // users row
      .mockResolvedValueOnce([[]])         // getShopForUser
      .mockResolvedValueOnce([[]])         // getRiderForUser
      .mockResolvedValueOnce([[]])         // getMobileAdminForUser by user_id
      .mockResolvedValueOnce([[]]);        // getMobileAdminForUser by phone

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken(1)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.shop).toBeNull();
    expect(res.body.rider).toBeNull();
    expect(res.body.admin).toBeNull();
  });

  it('returns the mobile admin payload for an active mobile admin phone', async () => {
    pool.query
      .mockResolvedValueOnce([[USER_ROW]]) // users row
      .mockResolvedValueOnce([[]])         // getShopForUser
      .mockResolvedValueOnce([[]])         // getRiderForUser
      .mockResolvedValueOnce([[{           // getMobileAdminForUser by user_id
        id: 4, phone: '9999999999', display_name: 'Owner Phone', user_id: 1, active: 1, created_at: null,
      }]]);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken(1)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.admin).toMatchObject({ id: 4, displayName: 'Owner Phone', active: true });
  });

  it('attaches admin on first login when mobile_admins.user_id is still null (phone match + backfill)', async () => {
    pool.query
      .mockResolvedValueOnce([[USER_ROW]]) // users row
      .mockResolvedValueOnce([[]])         // getShopForUser
      .mockResolvedValueOnce([[]])         // getRiderForUser
      .mockResolvedValueOnce([[]])         // getMobileAdminForUser by user_id — not linked yet
      .mockResolvedValueOnce([[{           // getMobileAdminForUser by phone
        id: 4, phone: '9999999999', display_name: 'Owner Phone', user_id: null, active: 1, created_at: null,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // backfill user_id

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken(1)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.admin).toMatchObject({ id: 4, displayName: 'Owner Phone', active: true, userId: 1 });
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE mobile_admins SET user_id = ? WHERE id = ? AND user_id IS NULL',
      [1, 4]
    );
  });
});
