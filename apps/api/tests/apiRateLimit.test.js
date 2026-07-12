/**
 * General /api rate limiter (300/min) — health must stay exempt.
 */
const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

// Mirror app.js ordering: health first, then limiter on /api, then a stub route.
function buildApp({ max = 3 } = {}) {
  const app = express();
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/ping', (req, res) => res.status(200).json({ ok: true }));
  app.use('/api', rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  app.get('/api/test', (req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('general API rate limiter', () => {
  it('returns 429 after limit on /api routes', async () => {
    const app = buildApp({ max: 2 });
    expect((await request(app).get('/api/test')).statusCode).toBe(200);
    expect((await request(app).get('/api/test')).statusCode).toBe(200);
    const limited = await request(app).get('/api/test');
    expect(limited.statusCode).toBe(429);
  });

  it('health is exempt from the /api limiter', async () => {
    const app = buildApp({ max: 1 });
    await request(app).get('/api/test');
    await request(app).get('/api/test'); // would 429 if under /api
    const health = await request(app).get('/health');
    expect(health.statusCode).toBe(200);
    const ping = await request(app).get('/ping');
    expect(ping.statusCode).toBe(200);
  });
});
