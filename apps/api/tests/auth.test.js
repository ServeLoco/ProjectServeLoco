const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/authRoutes');
const { pool } = require('../src/db/mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register a new customer', async () => {
    pool.query.mockResolvedValueOnce([[]]); // check existing phone
    pool.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert user
    pool.query.mockResolvedValueOnce([{ insertId: 1 }]); // insert admin_notification row
    // adminNotifications.create also does a SELECT for the inserted row, but we swallow it via try/catch on console.error
    pool.query.mockResolvedValueOnce([[]]); // optional fallback for any extra calls

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        phone: '1234567890',
        password: 'Password123!',
        address: '123 Test St',
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
  });

  it('should not register with duplicate phone', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]); // user exists

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        phone: '1234567890',
        whatsappNumber: '1234567890',
        password: 'password123',
        address: 'Test Address'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toContain('Phone number already registered');
  });

  it('should login an existing customer', async () => {
    const hash = await bcrypt.hash('password123', 10);
    pool.query.mockResolvedValueOnce([[{ id: 1, phone: '1234567890', password: hash }]]); // find user

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '1234567890',
        password: 'password123'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('id', 1);
  });

  // Phone normalization — same person must be able to register with one
  // format and log in with the other. Without normalization, registering
  // "+919876543210" stores that string, but logging in with "9876543210"
  // misses the row and returns 401.
  it('should normalize phone: register with +91 prefix, login with bare 10 digits', async () => {
    pool.query.mockResolvedValueOnce([[]]); // duplicate-phone SELECT -> empty
    pool.query.mockResolvedValueOnce([{ insertId: 42 }]); // INSERT new user
    pool.query.mockResolvedValueOnce([[]]); // admin notification: swallow extra queries

    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Same Person',
        phone: '+919876543210',
        password: 'Password123!',
        address: '123 Test St',
      });

    expect(reg.statusCode).toEqual(201);
    expect(reg.body.user).toHaveProperty('phone', '9876543210');
    expect(reg.body.user).toHaveProperty('id', 42);

    const hash = await bcrypt.hash('Password123!', 10);
    pool.query.mockResolvedValueOnce([[{
      id: 42,
      name: 'Same Person',
      phone: '9876543210',
      whatsapp_number: null,
      address: '123 Test St',
      trusted: 0,
      blocked: 0,
      created_at: new Date(),
      password_hash: hash,
    }]]); // login SELECT hits the normalized phone

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '9876543210',
        password: 'Password123!',
      });

    expect(login.statusCode).toEqual(200);
    expect(login.body.user).toHaveProperty('id', 42);
    // Confirm the SELECT was called with the normalized phone, not the raw input.
    expect(pool.query).toHaveBeenCalled();
    const loginCall = pool.query.mock.calls[pool.query.mock.calls.length - 1];
    expect(loginCall[0]).toMatch(/SELECT.*FROM users WHERE phone = \?/);
    expect(loginCall[1]).toEqual(['9876543210']);
  });

  it('should normalize phone: register with bare 10 digits, login with +91 prefix', async () => {
    pool.query.mockResolvedValueOnce([[]]); // duplicate-phone SELECT -> empty
    pool.query.mockResolvedValueOnce([{ insertId: 7 }]); // INSERT new user
    pool.query.mockResolvedValueOnce([[]]); // admin notification

    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Other Person',
        phone: '9876543210',
        password: 'Password123!',
      });

    expect(reg.statusCode).toEqual(201);
    expect(reg.body.user).toHaveProperty('phone', '9876543210');

    const hash = await bcrypt.hash('Password123!', 10);
    pool.query.mockResolvedValueOnce([[{
      id: 7,
      name: 'Other Person',
      phone: '9876543210',
      whatsapp_number: null,
      address: null,
      trusted: 0,
      blocked: 0,
      created_at: new Date(),
      password_hash: hash,
    }]]);

    const login = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '+919876543210',
        password: 'Password123!',
      });

    expect(login.statusCode).toEqual(200);
    expect(login.body.user).toHaveProperty('id', 7);
  });

  it('should reject register with a phone that normalizes to fewer than 10 digits', async () => {
    // "+91 12" has too few digits -> slice(-10) returns "12" (length 2).
    // The route-level isPhone validator (10-15 digits) catches this before
    // the controller is reached; that's still a 400 with VALIDATION_ERROR.
    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Bad Phone',
        phone: '+9112',
        password: 'Password123!',
      });

    expect(reg.statusCode).toEqual(400);
    expect(reg.body).toHaveProperty('code', 'VALIDATION_ERROR');
    // Crucially: must not have hit the DB.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('should reject login with a phone that normalizes to fewer than 10 digits', async () => {
    // Same as above: caught by the route validator, not the controller.
    const login = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '+9112',
        password: 'Password123!',
      });

    expect(login.statusCode).toEqual(400);
    expect(login.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(pool.query).not.toHaveBeenCalled();
  });

it('should treat +919876543210 and 9876543210 as the same account (register with +91, login with 10-digit)', async () => {
    // Register with +919876543210. The controller should normalize this to
    // "9876543210" before any DB lookup.
    pool.query.mockResolvedValueOnce([[]]); // SELECT existing user (none)
    pool.query.mockResolvedValueOnce([{ insertId: 42 }]); // INSERT user
    // adminNotifications swallows any further pool.query failures via try/catch,
    // so we don't need to mock the admin notification calls explicitly.

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Cross Format User',
        phone: '+919876543210',
        password: 'Password123!',
        address: '123 Test St',
      });

    expect(registerRes.statusCode).toEqual(201);
    expect(registerRes.body).toHaveProperty('token');
    expect(registerRes.body.user).toHaveProperty('id', 42);
    // The response must echo the normalized phone, not the raw +91 form.
    expect(registerRes.body.user).toHaveProperty('phone', '9876543210');

    jest.clearAllMocks();

    // Now log in with the plain 10-digit form. The same normalized phone
    // must be used for the DB lookup, and the same user id must come back.
    const hash = await bcrypt.hash('Password123!', 10);
    pool.query.mockResolvedValueOnce([[{
      id: 42,
      name: 'Cross Format User',
      phone: '9876543210',
      whatsapp_number: null,
      address: '123 Test St',
      trusted: 0,
      blocked: 0,
      created_at: new Date(),
      password_hash: hash,
    }]]);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '9876543210',
        password: 'Password123!',
      });

    expect(loginRes.statusCode).toEqual(200);
    expect(loginRes.body).toHaveProperty('token');
    expect(loginRes.body.user).toHaveProperty('id', 42);
    expect(loginRes.body.user).toHaveProperty('phone', '9876543210');
  });

  it('should treat 9876543210 and +919876543210 as the same account (register with 10-digit, login with +91)', async () => {
    // Register with the plain 10-digit form. Normalization is a no-op here
    // but we still need the lookup + insert chain to work.
    pool.query.mockResolvedValueOnce([[]]); // SELECT existing user (none)
    pool.query.mockResolvedValueOnce([{ insertId: 77 }]); // INSERT user

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Reverse Format User',
        phone: '9876543210',
        password: 'Password123!',
        address: '123 Test St',
      });

    expect(registerRes.statusCode).toEqual(201);
    expect(registerRes.body.user).toHaveProperty('id', 77);
    expect(registerRes.body.user).toHaveProperty('phone', '9876543210');

    jest.clearAllMocks();

    // Now log in with the +91 form. The controller must normalize it down
    // to "9876543210" before hitting the DB.
    const hash = await bcrypt.hash('Password123!', 10);
    pool.query.mockResolvedValueOnce([[{
      id: 77,
      name: 'Reverse Format User',
      phone: '9876543210',
      whatsapp_number: null,
      address: '123 Test St',
      trusted: 0,
      blocked: 0,
      created_at: new Date(),
      password_hash: hash,
    }]]);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '+919876543210',
        password: 'Password123!',
      });

    expect(loginRes.statusCode).toEqual(200);
    expect(loginRes.body.user).toHaveProperty('id', 77);
    expect(loginRes.body.user).toHaveProperty('phone', '9876543210');
  });

  it('should store the normalized phone in the INSERT for register', async () => {
    // Sanity check: when the client sends "+919876543210", the parameter
    // bound to the phone column in the INSERT must be "9876543210" — not
    // "+919876543210" and not "919876543210". The duplicate-phone SELECT
    // must also use the normalized form.
    pool.query.mockResolvedValueOnce([[]]); // SELECT existing user
    pool.query.mockResolvedValueOnce([{ insertId: 5 }]); // INSERT user

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Insert Check',
        phone: '+919876543210',
        password: 'Password123!',
        address: 'addr',
      });

    // First call: SELECT existing by phone — bound param must be normalized.
    const selectCall = pool.query.mock.calls[0];
    expect(selectCall[0]).toMatch(/SELECT id FROM users WHERE phone = \?/);
    expect(selectCall[1]).toEqual(['9876543210']);

    // Second call: INSERT INTO users — bound phone param must also be normalized.
    const insertCall = pool.query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO users/);
    expect(insertCall[1]).toEqual(expect.arrayContaining(['9876543210']));
  });

  it('should reject login with an invalid (too-short) phone with 400', async () => {
    // The schema's isPhone() accepts strings of 10–15 digits with an optional
    // leading +. "12345" is only 5 digits, so the schema itself rejects it
    // with 400 before the controller runs. Either way the client sees 400.
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '12345',
        password: 'Password123!',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    // And we never hit the DB.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('should normalize the phone in password-reset requests in either format', async () => {
    // Use mockImplementation so we can capture every bound parameter and
    // prove the controller reaches the DB with the SAME normalized phone
    // regardless of which format the client used. We don't need to mock
    // the full happy path here — the security-critical observation is
    // that the SELECT is bound to "9876543210" in both cases.

    const capturedSelects = [];

    pool.query.mockImplementation(async (sql, params) => {
      if (/SELECT id FROM users WHERE phone = \?/.test(sql)) {
        capturedSelects.push(params[0]);
        return [[]];
      }
      // Anything else (pending-count, update, insert, admin notifications)
      // — return a benign empty result. The controller short-circuits to
      // 202 when the SELECT returns no rows, so we never reach these.
      return [[]];
    });

    await request(app)
      .post('/api/auth/password-reset-requests')
      .send({
        phone: '+919876543210',
        newPassword: 'NewPassword123!',
      });

    expect(capturedSelects).toEqual(['9876543210']);

    jest.clearAllMocks();
    capturedSelects.length = 0;

    pool.query.mockImplementation(async (sql, params) => {
      if (/SELECT id FROM users WHERE phone = \?/.test(sql)) {
        capturedSelects.push(params[0]);
        return [[]];
      }
      return [[]];
    });

    await request(app)
      .post('/api/auth/password-reset-requests')
      .send({
        phone: '9876543210',
        newPassword: 'NewPassword123!',
      });

    expect(capturedSelects).toEqual(['9876543210']);
  });

  it('should return the 202 success message for password reset when the phone is unknown (no account discovery)', async () => {
    // A request with a well-formed but unregistered phone must still
    // return the same success message — otherwise an attacker could
    // enumerate which phones have accounts by watching the response.
    pool.query.mockResolvedValueOnce([[]]); // SELECT user by phone → no rows

    const res = await request(app)
      .post('/api/auth/password-reset-requests')
      .send({
        phone: '+919876543210', // well-formed but not in the fake users table
        newPassword: 'NewPassword123!',
      });

    expect(res.statusCode).toEqual(202);
    expect(res.body.message).toMatch(/If the phone number is registered/);
  });
});
