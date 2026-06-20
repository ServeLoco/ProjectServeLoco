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
});
