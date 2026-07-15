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
});
