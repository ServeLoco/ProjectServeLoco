const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/adminRoutes');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin Auth Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_OWNER_ID;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
  });

  it('should login admin with correct credentials using hash', async () => {
    process.env.ADMIN_OWNER_ID = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    delete process.env.ADMIN_PASSWORD_HASH;

    const res = await request(app)
      .post('/api/admin/login')
      .send({
        ownerId: 'admin',
        password: 'admin'
      });

    if (res.statusCode !== 200) console.log(res.body);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toEqual('admin');
  });

  it('should fail admin login with incorrect credentials', async () => {
    process.env.ADMIN_OWNER_ID = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    delete process.env.ADMIN_PASSWORD_HASH;

    const res = await request(app)
      .post('/api/admin/login')
      .send({
        ownerId: 'admin',
        password: 'wrong'
      });

    expect(res.statusCode).toEqual(401);
    expect(res.body.message).toContain('Invalid admin credentials');
  });
});
