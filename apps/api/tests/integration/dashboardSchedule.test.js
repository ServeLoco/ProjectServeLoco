// Home section and section item schedules, against a REAL MySQL. The admin
// sends a schedule as a UTC ISO string ("2026-10-04T08:04:35.953Z"), which
// MySQL in strict mode rejects as a datetime literal — only a real server
// shows the 500. The Home queries compare these columns with NOW(), so the
// stored value must be the same moment, not just accepted.
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

const { describeWithMysql, assertMysqlReady, pool, FIXTURE_TAG } = require('../helpers/realMysql');
const adminRoutes = require('../../src/routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

// Same complete area_admin session orderConcurrency.test.js uses.
const adminToken = jwt.sign(
  { id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 1 },
  process.env.JWT_SECRET || 'secret'
);
const admin = (method, url) => request(app)[method](`/api/admin${url}`).set('Authorization', `Bearer ${adminToken}`);

// "YYYY-MM-DDTHH:MM" as an IST clock shows that instant.
const istWallClock = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 16);

const isLive = async (table, id) => {
  const [[row]] = await pool.query(
    `SELECT (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW()) AS live
     FROM ${table} WHERE id = ?`,
    [id]
  );
  return Number(row.live) === 1;
};

describeWithMysql('Home section schedules (real MySQL)', () => {
  const ids = {};
  const slug = `${FIXTURE_TAG.toLowerCase()}-sched`;

  beforeAll(async () => {
    await assertMysqlReady();
    const [cat] = await pool.query(
      "INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', 1)",
      [`${FIXTURE_TAG} Sched Cat`, `${FIXTURE_TAG.toLowerCase()}-sched-cat`]
    );
    ids.category = cat.insertId;
  });

  afterAll(async () => {
    if (ids.section) {
      await pool.query('DELETE FROM dashboard_section_items WHERE section_id = ?', [ids.section]);
      await pool.query('DELETE FROM dashboard_sections WHERE id = ?', [ids.section]);
    }
    await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    await pool.end();
  });

  it('saves a section with a UTC ISO start an hour ago, and it is live', async () => {
    const hourAgo = Date.now() - 3600000;
    const dayOn = Date.now() + 86400000;
    let res = await admin('post', '/dashboard-sections').send({
      title: 'Scheduled', slug, section_type: 'category_grid', store_type: 'packed',
      starts_at: new Date(hourAgo).toISOString(),
      ends_at: new Date(dayOn).toISOString(),
    });
    expect(res.statusCode).toBe(201);
    ids.section = res.body.id;

    expect(await isLive('dashboard_sections', ids.section)).toBe(true);
    res = await admin('get', `/dashboard-sections/${ids.section}`);
    // TIMESTAMP keeps whole seconds.
    expect(Math.abs(new Date(res.body.data.starts_at).getTime() - hourAgo)).toBeLessThan(1000);
    expect(Math.abs(new Date(res.body.data.ends_at).getTime() - dayOn)).toBeLessThan(1000);
  });

  it('reads a bare start time as IST and clears a schedule sent as empty', async () => {
    const hourOn = Date.now() + 3600000;
    let res = await admin('patch', `/dashboard-sections/${ids.section}`).send({ starts_at: istWallClock(hourOn) });
    expect(res.statusCode).toBe(200);
    expect(await isLive('dashboard_sections', ids.section)).toBe(false);
    res = await admin('get', `/dashboard-sections/${ids.section}`);
    expect(Math.abs(new Date(res.body.data.starts_at).getTime() - hourOn)).toBeLessThan(60000);

    res = await admin('patch', `/dashboard-sections/${ids.section}`).send({ starts_at: '', ends_at: null });
    expect(res.statusCode).toBe(200);
    const [[row]] = await pool.query('SELECT starts_at, ends_at FROM dashboard_sections WHERE id = ?', [ids.section]);
    expect(row).toEqual({ starts_at: null, ends_at: null });
  });

  it('saves and updates a section item schedule sent as UTC ISO', async () => {
    const hourAgo = Date.now() - 3600000;
    let res = await admin('post', `/dashboard-sections/${ids.section}/items`).send({
      item_type: 'category', item_id: ids.category,
      starts_at: new Date(hourAgo).toISOString(),
    });
    expect(res.statusCode).toBe(201);
    const itemId = res.body.id;
    expect(await isLive('dashboard_section_items', itemId)).toBe(true);

    res = await admin('patch', `/dashboard-sections/${ids.section}/items/${itemId}`).send({
      ends_at: new Date(hourAgo + 60000).toISOString(),
    });
    expect(res.statusCode).toBe(200);
    expect(await isLive('dashboard_section_items', itemId)).toBe(false);
  });

  it('still rejects an end before the start', async () => {
    const res = await admin('patch', `/dashboard-sections/${ids.section}`).send({
      starts_at: new Date(Date.now() + 7200000).toISOString(),
      ends_at: istWallClock(Date.now() + 3600000),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('End time must be after start time');
  });
});
