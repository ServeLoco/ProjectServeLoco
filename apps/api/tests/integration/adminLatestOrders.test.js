// The admin dashboard's "latest orders" against a REAL MySQL. It used to be
// one ORDER BY (status = 'Pending') DESC, created_at DESC that sorted every
// order of the area on each load; it is now the newest 10 Pending plus the
// newest 10 others, merged. These tests hold it to the old ordering — same
// rows, same order — on data with many same-second created_at ties, which
// is where a merge like this would go wrong.
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
  createUser,
  createOrderRow,
  cleanupFixtures,
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

const ORDERS = 30;

describeWithMysql('admin dashboard latest orders', () => {
  let areaId;
  let orderIds = [];

  // The old query, with id added as the tie-break it never had.
  const expectedIds = async () => {
    const [rows] = await pool.query(
      `SELECT id FROM orders WHERE area_id = ?
        ORDER BY (status = 'Pending') DESC, created_at DESC, id DESC LIMIT 10`,
      [areaId]
    );
    return rows.map((row) => row.id);
  };

  const dashboardIds = async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Area-Id', String(areaId));
    expect(res.statusCode).toBe(200);
    return res.body.data.latest_orders.map((order) => order.id);
  };

  const setPending = async (ids) => {
    await pool.query("UPDATE orders SET status = 'Delivered' WHERE area_id = ?", [areaId]);
    if (ids.length) await pool.query("UPDATE orders SET status = 'Pending' WHERE id IN (?)", [ids]);
  };

  beforeAll(async () => {
    await assertMysqlReady();
    areaScope._resetCachesForTests();
    const [area] = await pool.query(
      'INSERT INTO areas (code, name, active) VALUES (?, ?, 1)',
      [`${FIXTURE_TAG}LO`.slice(0, 16), `${FIXTURE_TAG} latest orders`]
    );
    areaId = area.insertId;
    const customer = await createUser('Latest orders customer');
    for (let i = 0; i < ORDERS; i += 1) {
      orderIds.push(await createOrderRow(customer, { status: 'Delivered', areaId }));
    }
    // Three orders per second, so most created_at values are shared.
    await pool.query(
      `UPDATE orders SET created_at = TIMESTAMP('2026-01-01') + INTERVAL FLOOR((id - ?) / 3) SECOND
        WHERE area_id = ?`,
      [orderIds[0], areaId]
    );
  });

  afterAll(async () => {
    await cleanupFixtures();
    await pool.query('DELETE FROM areas WHERE id = ?', [areaId]);
  });

  it('puts a few Pending orders first, then the newest of the rest', async () => {
    await setPending([orderIds[2], orderIds[10], orderIds[11]]);
    const ids = await dashboardIds();
    expect(ids).toEqual(await expectedIds());
    expect(ids.slice(0, 3)).toEqual([orderIds[11], orderIds[10], orderIds[2]]);
  });

  it('lists a Pending order that is also the newest order once', async () => {
    await setPending([orderIds[3], orderIds[ORDERS - 1]]);
    const ids = await dashboardIds();
    expect(ids).toEqual(await expectedIds());
    expect(new Set(ids).size).toBe(10);
    expect(ids.slice(0, 3)).toEqual([orderIds[ORDERS - 1], orderIds[3], orderIds[ORDERS - 2]]);
  });

  it('shows only Pending orders when there are more than 10', async () => {
    await setPending(orderIds.slice(5, 18));
    const ids = await dashboardIds();
    expect(ids).toEqual(await expectedIds());
    expect(ids).toEqual(orderIds.slice(8, 18).reverse());
  });

  it('shows the newest 10 when nothing is Pending', async () => {
    await setPending([]);
    const ids = await dashboardIds();
    expect(ids).toEqual(await expectedIds());
    expect(ids).toEqual(orderIds.slice(-10).reverse());
  });
});

afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
