// Tests for src/utils/fcmAlarmPush.js — native FCM data-only alarm delivery
// for the shop-owner / rider killed-app path. Focus: message shape (true
// data-only, correct collapseKey), dead-token hygiene, and that every path
// resolves rather than throws (callers rely on this to fall back to Expo).

jest.mock('../src/config/firebase', () => ({
  initFirebase: jest.fn(),
}));

const { getMessaging } = require('firebase-admin/messaging');
const { initFirebase } = require('../src/config/firebase');
const { sendFcmDataOnlyToUser, sendFcmDataOnlyToMany } = require('../src/utils/fcmAlarmPush');

const pool = { query: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fcmAlarmPush.sendFcmDataOnlyToUser', () => {
  it('returns firebase_uninitialized without querying the DB when initFirebase() returns null', async () => {
    initFirebase.mockReturnValue(null);

    const result = await sendFcmDataOnlyToUser(pool, 42, { alertType: 'rider_offer_alarm' });

    expect(result).toEqual({ sent: false, reason: 'firebase_uninitialized' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns no_fcm_token when the user has none registered', async () => {
    initFirebase.mockReturnValue({});
    pool.query.mockResolvedValueOnce([[]]);

    const result = await sendFcmDataOnlyToUser(pool, 42, { alertType: 'new_order_alarm' });

    expect(result).toEqual({ sent: false, reason: 'no_fcm_token' });
  });

  it('sends a true data-only message (no notification key) with stringified data', async () => {
    initFirebase.mockReturnValue({ name: 'app' });
    pool.query.mockResolvedValueOnce([[{ fcm_token: 'fcm-token-abc' }]]);
    const send = jest.fn().mockResolvedValue('msg-1');
    getMessaging.mockReturnValue({ send });

    const result = await sendFcmDataOnlyToUser(pool, 42, {
      alertType: 'rider_offer_alarm', offerId: 9, orderId: 7, expiresAt: null,
    });

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledWith({
      token: 'fcm-token-abc',
      data: { alertType: 'rider_offer_alarm', offerId: '9', orderId: '7' },
      android: {
        priority: 'high',
        ttl: 3600 * 1000,
        collapseKey: 'rider_offer_9',
      },
    });
    expect(send.mock.calls[0][0]).not.toHaveProperty('notification');
  });

  it('collapses by orderId when there is no offerId (shop new-order alarm)', async () => {
    initFirebase.mockReturnValue({});
    pool.query.mockResolvedValueOnce([[{ fcm_token: 'tok' }]]);
    const send = jest.fn().mockResolvedValue('msg-2');
    getMessaging.mockReturnValue({ send });

    await sendFcmDataOnlyToUser(pool, 7, { alertType: 'new_order_alarm', orderId: 1001 });

    expect(send.mock.calls[0][0].android.collapseKey).toBe('order_alarm_1001');
  });

  it('nulls fcm_token on messaging/registration-token-not-registered', async () => {
    initFirebase.mockReturnValue({});
    pool.query
      .mockResolvedValueOnce([[{ fcm_token: 'dead-token' }]])
      .mockResolvedValueOnce([{}]);
    const send = jest.fn().mockRejectedValue(
      Object.assign(new Error('not registered'), {
        errorInfo: { code: 'messaging/registration-token-not-registered' },
      })
    );
    getMessaging.mockReturnValue({ send });

    const result = await sendFcmDataOnlyToUser(pool, 42, { alertType: 'new_order_alarm', orderId: 1 });

    expect(result).toEqual({ sent: false, reason: 'not registered' });
    expect(pool.query).toHaveBeenLastCalledWith(
      'UPDATE users SET fcm_token = NULL WHERE id = ?', [42]
    );
  });

  it('does not touch fcm_token on a transient send error', async () => {
    initFirebase.mockReturnValue({});
    pool.query.mockResolvedValueOnce([[{ fcm_token: 'tok' }]]);
    const send = jest.fn().mockRejectedValue(new Error('network blip'));
    getMessaging.mockReturnValue({ send });

    const result = await sendFcmDataOnlyToUser(pool, 42, { alertType: 'new_order_alarm', orderId: 1 });

    expect(result).toEqual({ sent: false, reason: 'network blip' });
    expect(pool.query).toHaveBeenCalledTimes(1); // only the SELECT, no UPDATE
  });

  it('swallows DB errors and never throws', async () => {
    initFirebase.mockReturnValue({});
    pool.query.mockRejectedValueOnce(new Error('db down'));

    await expect(sendFcmDataOnlyToUser(pool, 42, {})).resolves.toEqual({
      sent: false, reason: 'db down',
    });
  });
});

describe('fcmAlarmPush.sendFcmDataOnlyToMany', () => {
  it('returns an empty array without touching the DB when userIds is empty', async () => {
    await expect(sendFcmDataOnlyToMany(pool, [], {})).resolves.toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns only the userIds that did not get a successful FCM send', async () => {
    initFirebase.mockReturnValue({});
    const send = jest.fn().mockResolvedValue('ok');
    getMessaging.mockReturnValue({ send });
    pool.query
      .mockResolvedValueOnce([[{ fcm_token: 'tok-1' }]]) // user 1 — has token, sends OK
      .mockResolvedValueOnce([[]]); // user 2 — no token, needs Expo fallback

    const remaining = await sendFcmDataOnlyToMany(pool, [1, 2], {
      alertType: 'new_order_alarm', orderId: 5,
    });

    expect(remaining).toEqual([2]);
  });
});
