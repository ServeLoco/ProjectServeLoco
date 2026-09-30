// The admin bell (GET /api/admin/inbox) against a REAL MySQL. It lists the
// newest 20, ORDER BY created_at DESC, id DESC, for one area or for "All
// areas". Without an index in that order MySQL read and sorted every inbox
// row on each open. Which index MySQL picks is database behaviour a mocked
// pool can't show, so these capture the list query the handler really sends
// and EXPLAIN it.
//
// The table is filled to production size (~2,000 rows on 30 Sep 2026): below
// roughly 1,000 rows MySQL rightly prefers reading the whole small table, so a
// handful of fixture rows would not show the plan production gets. The plan is
// asserted for one area only: for "All areas" MySQL's choice also depends on
// row width (real inbox text gets the index, these short rows don't), so that
// view is held to its result alone.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const {
  DB_TESTS_ENABLED,
  describeWithMysql,
  assertMysqlReady,
  pool,
  FIXTURE_TAG,
} = require('../helpers/realMysql');
const areaScope = require('../../src/utils/areaScope');
const adminRoutes = require('../../src/routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const superToken = jwt.sign(
  { id: 'super', role: 'admin', adminRole: 'super_admin', areaId: null },
  process.env.JWT_SECRET || 'secret'
);

const ROWS = 2000;
const NEW_INDEXES = ['idx_admin_notifications_area_created', 'idx_admin_notifications_created'];

describeWithMysql('admin inbox list', () => {
  const areaIds = [];

  // Opens the bell and returns the listed ids plus the list query it ran.
  const openInbox = async (areaHeader) => {
    const spy = jest.spyOn(pool, 'query');
    try {
      const res = await request(app)
        .get('/api/admin/inbox')
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Area-Id', areaHeader);
      expect(res.statusCode).toBe(200);
      const listQuery = spy.mock.calls.find(([sql]) => /FROM admin_notifications[\s\S]*ORDER BY created_at DESC/.test(sql));
      return { ids: res.body.data.map((row) => row.id), listQuery };
    } finally {
      spy.mockRestore();
    }
  };

  // The same list the way MySQL built it before: no index, sort every row.
  const listedTheOldWay = async (areaId) => {
    const [rows] = await pool.query(
      `SELECT id FROM admin_notifications IGNORE INDEX (${NEW_INDEXES.join(', ')})
        WHERE 1=1${areaId ? ' AND area_id = ?' : ''}
        ORDER BY created_at DESC, id DESC LIMIT 20`,
      areaId ? [areaId] : []
    );
    return rows.map((row) => row.id);
  };

  const expectIndexedPlan = async ([sql, params]) => {
    const [[plan]] = await pool.query(`EXPLAIN ${sql}`, params);
    expect(NEW_INDEXES).toContain(plan.key);
    expect(plan.Extra || '').not.toMatch(/filesort/i);
  };

  beforeAll(async () => {
    await assertMysqlReady();
    areaScope._resetCachesForTests();
    for (const suffix of ['IN', 'IO']) {
      const [area] = await pool.query(
        'INSERT INTO areas (code, name, active) VALUES (?, ?, 1)',
        [`${FIXTURE_TAG}${suffix}`.slice(0, 16), `${FIXTURE_TAG} inbox ${suffix}`]
      );
      areaIds.push(area.insertId);
    }
    // Mostly one busy area, like production. Newer than anything else in the
    // database, three to a second so id has to break created_at ties.
    const second = (i) => new Date(Date.UTC(2030, 0, 1) + Math.floor(i / 3) * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');
    const rows = Array.from({ length: ROWS }, (_, i) => [
      areaIds[i % 20 === 0 ? 1 : 0], 'new_order', `${FIXTURE_TAG} inbox ${i}`, 'body', `${FIXTURE_TAG}-${i}`, second(i),
    ]);
    await pool.query(
      'INSERT INTO admin_notifications (area_id, type, title, body, related_id, created_at) VALUES ?',
      [rows]
    );
    // On a fresh CI database the indexes were built on an empty table, and
    // InnoDB refreshes its row estimates in the background — EXPLAIN right
    // after the insert would plan for an empty table.
    await pool.query('ANALYZE TABLE admin_notifications');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM admin_notifications WHERE title LIKE ?', [`${FIXTURE_TAG} inbox %`]);
    await pool.query('DELETE FROM areas WHERE id IN (?)', [areaIds]);
  });

  it.each([
    ['the busy area', () => areaIds[0]],
    ['a small area', () => areaIds[1]],
  ])('lists the newest 20 for %s off an index, same as before', async (_label, areaOf) => {
    const areaId = areaOf();
    const { ids, listQuery } = await openInbox(String(areaId));

    expect(ids).toHaveLength(20);
    expect(ids).toEqual(await listedTheOldWay(areaId));
    await expectIndexedPlan(listQuery);
  });

  it('lists the newest 20 of All areas, same as before', async () => {
    const { ids } = await openInbox('all');

    expect(ids).toHaveLength(20);
    expect(ids).toEqual(await listedTheOldWay(null));
  });
});

afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
