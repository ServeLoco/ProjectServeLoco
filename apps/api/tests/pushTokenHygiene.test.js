const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRoutes = require('../src/routes/authRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

// expo-server-sdk mock: isExpoPushToken accepts the ExponentPushToken[...] shape
// the test uses, matching the project's tests/__mocks__/expo-server-sdk.js.
// A constructable class (not a plain object) — utils/expoPush.js does `new Expo()`
// at module load time (adminNotifications.js now requires it transitively too).
jest.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken(t) {
      return typeof t === 'string' && t.startsWith('ExponentPushToken[');
    }
    chunkPushNotifications(messages) {
      return [messages];
    }
    async sendPushNotificationsAsync() {
      return [];
    }
  }
  return { Expo };
});

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const signToken = (id) => jwt.sign({ id, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describe('TASK 9 — push-token hygiene', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('registering a token detaches it from other users (A→NULL, B→token)', async () => {
    // User B registers token T that user A already holds. The handler must run
    // the detach UPDATE (push_token = NULL WHERE push_token = T AND id != B)
    // BEFORE claiming the token for B.
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // detach other users
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // claim for B

    const tokenB = signToken(2); // user B
    const pushToken = 'ExponentPushToken[shared-device-token]';

    const res = await request(app)
      .post('/api/auth/me/push-token')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ push_token: pushToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const calls = pool.query.mock.calls;
    // First UPDATE detaches the token from every OTHER user.
    expect(calls[0][0]).toMatch(/UPDATE users SET push_token = NULL WHERE push_token = \? AND id != \?/i);
    expect(calls[0][1]).toEqual([pushToken, 2]);
    // Second UPDATE claims it for the registering user.
    expect(calls[1][0]).toMatch(/UPDATE users SET push_token = \? WHERE id = \?/i);
    expect(calls[1][1]).toEqual([pushToken, 2]);
    // Detach must run before claim (order matters).
    const detachIdx = calls.findIndex(([sql]) => /push_token = NULL WHERE push_token = \? AND id != \?/i.test(sql));
    const claimIdx = calls.findIndex(([sql]) => /SET push_token = \? WHERE id = \?/i.test(sql));
    expect(detachIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(detachIdx).toBeLessThan(claimIdx);
  });

  it('POST /api/auth/logout nulls the user push_token and returns 200 { data: { ok: true } }', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${signToken(5)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
    expect(pool.query.mock.calls[0][0]).toMatch(/UPDATE users SET push_token = NULL,\s*fcm_token = NULL WHERE id = \?/i);
    expect(pool.query.mock.calls[0][1]).toEqual([5]);
  });

  it('registering with a valid fcm_token also detaches and claims it', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // detach push_token from others
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // claim push_token
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // detach fcm_token from others
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // claim fcm_token

    const tokenB = signToken(2);
    const fcmToken = 'a'.repeat(20); // meets the length >= 20 gate

    const res = await request(app)
      .post('/api/auth/me/push-token')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ push_token: 'ExponentPushToken[x]', fcm_token: fcmToken });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(4);

    const calls = pool.query.mock.calls;
    expect(calls[2][0]).toMatch(/UPDATE users SET fcm_token = NULL WHERE fcm_token = \? AND id != \?/i);
    expect(calls[2][1]).toEqual([fcmToken, 2]);
    expect(calls[3][0]).toMatch(/UPDATE users SET fcm_token = \? WHERE id = \?/i);
    expect(calls[3][1]).toEqual([fcmToken, 2]);
  });

  it('registering without a fcm_token skips the fcm_token queries entirely', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/auth/me/push-token')
      .set('Authorization', `Bearer ${signToken(2)}`)
      .send({ push_token: 'ExponentPushToken[x]' });

    expect(res.statusCode).toBe(200);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a too-short fcm_token (below the 20-char validity gate) without querying it', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/auth/me/push-token')
      .set('Authorization', `Bearer ${signToken(2)}`)
      .send({ push_token: 'ExponentPushToken[x]', fcm_token: 'too-short' });

    expect(res.statusCode).toBe(200);
    expect(pool.query).toHaveBeenCalledTimes(2); // push_token detach+claim only
  });
});
