const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

jest.mock('../src/realtime/socket', () => ({
  getRealtimeStatus: jest.fn(),
}));

const { getRealtimeStatus } = require('../src/realtime/socket');
const realtimeRoutes = require('../src/routes/realtimeRoutes');

const app = express();
app.use(express.json());
app.use('/api/realtime', realtimeRoutes);

const createAdminToken = () => jwt.sign({ sub: '9350238504', role: 'admin' }, config.JWT_SECRET);
const createCustomerToken = () => jwt.sign({ sub: 42, role: 'customer' }, config.JWT_SECRET);

describe('Realtime health endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/realtime/health');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/realtime/health')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when customer token is used', async () => {
    const token = createCustomerToken();
    const res = await request(app)
      .get('/api/realtime/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 200 with status when admin token is used', async () => {
    getRealtimeStatus.mockReturnValue({ enabled: true, connectedSockets: 3 });
    const token = createAdminToken();

    const res = await request(app)
      .get('/api/realtime/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, connectedSockets: 3 });
    expect(getRealtimeStatus).toHaveBeenCalledTimes(1);
  });

  it('returns enabled: false when socket server is not initialized', async () => {
    getRealtimeStatus.mockReturnValue({ enabled: false, connectedSockets: 0 });
    const token = createAdminToken();

    const res = await request(app)
      .get('/api/realtime/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.connectedSockets).toBe(0);
  });

  it('returns correct connected socket count', async () => {
    getRealtimeStatus.mockReturnValue({ enabled: true, connectedSockets: 42 });
    const token = createAdminToken();

    const res = await request(app)
      .get('/api/realtime/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.connectedSockets).toBe(42);
  });
});
