// An admin broadcast (POST /api/admin/notifications) against a REAL MySQL:
// what each recipient's open app receives over the socket. It used to re-read
// every full row and run an unread COUNT per customer, twice; now one lean
// read-back by batch and one grouped count. The customer must still get the
// same two events, once each: the new notification, then their true unread
// count (with the new one included, and read or deleted ones not).
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const mockedModule = (modulePath) => {
  const actual = jest.requireActual(modulePath);
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => [
      key,
      typeof value === 'function' ? jest.fn().mockResolvedValue(null) : value,
    ])
  );
};

jest.mock('../../src/realtime/socket', () => mockedModule('../../src/realtime/socket'));
jest.mock('../../src/utils/expoPush', () => mockedModule('../../src/utils/expoPush'));

const {
  DB_TESTS_ENABLED,
  describeWithMysql,
  assertMysqlReady,
  pool,
  FIXTURE_TAG,
  createUser,
} = require('../helpers/realMysql');
const { emitToCustomer } = require('../../src/realtime/socket');
const areaScope = require('../../src/utils/areaScope');
const adminRoutes = require('../../src/routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const superToken = jwt.sign(
  { id: 'super', role: 'admin', adminRole: 'super_admin', areaId: null },
  process.env.JWT_SECRET || 'secret'
);

describeWithMysql('admin broadcast socket events', () => {
  let areaId;
  const customers = {};

  const addNotification = (userId, { read = false, deleted = false } = {}) => pool.query(
    `INSERT INTO notifications (user_id, title, body, type, read_at, deleted_at)
     VALUES (?, ?, 'older', 'info', ?, ?)`,
    [userId, `${FIXTURE_TAG} older`, read ? new Date() : null, deleted ? new Date() : null]
  );

  beforeAll(async () => {
    await assertMysqlReady();
    areaScope._resetCachesForTests();
    const [area] = await pool.query(
      'INSERT INTO areas (code, name, active) VALUES (?, ?, 1)',
      [`${FIXTURE_TAG}BC`.slice(0, 16), `${FIXTURE_TAG} broadcast`]
    );
    areaId = area.insertId;
    for (const name of ['two unread', 'nothing unread', 'one unread']) {
      customers[name] = await createUser(name);
    }
    await pool.query('UPDATE users SET current_area_id = ? WHERE id IN (?)', [areaId, Object.values(customers)]);
    await addNotification(customers['two unread']);
    await addNotification(customers['two unread']);
    await addNotification(customers['two unread'], { read: true });
    await addNotification(customers['nothing unread'], { read: true });
    await addNotification(customers['one unread']);
    await addNotification(customers['one unread'], { deleted: true });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id IN (?)', [Object.values(customers)]); // notifications cascade
    await pool.query('DELETE FROM notification_batches WHERE area_id = ?', [areaId]);
    await pool.query('DELETE FROM areas WHERE id = ?', [areaId]);
  });

  it('sends each recipient the new notification and their true unread count, once each', async () => {
    emitToCustomer.mockClear();
    const spy = jest.spyOn(pool, 'query');
    let res;
    let sql;
    try {
      res = await request(app)
        .post('/api/admin/notifications')
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Area-Id', String(areaId))
        .send({ title: `${FIXTURE_TAG} Weekend offer`, body: '20% off', type: 'info', target: 'everyone' });
      sql = spy.mock.calls.map(([statement]) => String(statement));
    } finally {
      spy.mockRestore();
    }
    expect(res.statusCode).toBe(201);
    expect(res.body.data.recipientCount).toBe(3);

    const expectedUnread = { 'two unread': 3, 'nothing unread': 1, 'one unread': 2 };
    for (const [name, userId] of Object.entries(customers)) {
      const events = emitToCustomer.mock.calls.filter(([to]) => Number(to) === userId);
      expect(events.map(([, event]) => event)).toEqual([
        'notification.created',
        'notification.unread_count.updated',
      ]);

      const [[row]] = await pool.query(
        'SELECT id, created_at FROM notifications WHERE user_id = ? AND batch_id = ?',
        [userId, res.body.data.batchId]
      );
      expect(events[0][2]).toEqual({
        id: row.id,
        title: `${FIXTURE_TAG} Weekend offer`,
        body: '20% off',
        type: 'info',
        sourceType: 'broadcast',
        sourceId: undefined, // broadcasts carry no source id, same as before
        actionType: undefined,
        actionPayload: null,
        createdAt: row.created_at,
      });
      expect(events[1][2]).toEqual({ unreadCount: expectedUnread[name] });
    }

    // One grouped count for all recipients, and no full-row read-back.
    expect(sql.filter((s) => /COUNT\(\*\)[\s\S]*FROM notifications/.test(s))).toHaveLength(1);
    expect(sql.filter((s) => /SELECT \* FROM notifications/.test(s))).toHaveLength(0);
  });
});

afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
