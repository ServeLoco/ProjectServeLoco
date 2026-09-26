/**
 * GET /api/admin/analytics/heatmap — where the app was opened, per IST day,
 * scoped by the area the phone was IN when it opened.
 */
const request = require('supertest');
const express = require('express');

const makeCursor = (data) => ({ toArray: jest.fn().mockResolvedValue(data) });
const mockMongoFns = { aggregate: jest.fn() };
jest.mock('../src/db/mongodb', () => ({
  getDb: jest.fn(() => ({ collection: () => mockMongoFns })),
}));

const mockMysqlPool = { query: jest.fn() };
jest.mock('../src/db/mysql', () => ({ pool: mockMysqlPool }));

process.env.NODE_ENV = 'test';

const { adminRouter } = require('../src/routes/analyticsRoutes');
const { signAdminToken } = require('../src/utils/auth');
const areaScope = require('../src/utils/areaScope');
const { getDb } = require('../src/db/mongodb');

const app = express();
app.use(express.json());
app.use('/api/admin/analytics', adminRouter);

const areaAdmin = signAdminToken(1, { adminRole: 'area_admin', areaId: 2 });
const superAdmin = signAdminToken(2, { adminRole: 'super_admin', areaId: null });

const AREAS = [
  { id: 1, code: 'A1', name: 'Hisar', active: 1 },
  { id: 2, code: 'A2', name: 'Bengaluru', active: 1 },
];
const ZONES = [
  { id: 4, area_id: 2, name: 'Koramangala', boundary: JSON.stringify([{ lat: 12.9, lng: 77.6 }, { lat: 13, lng: 77.6 }, { lat: 13, lng: 77.7 }]) },
];

const FACET = {
  cells: [
    { lat: 12.972, lng: 77.605, opens: 5, users: 3 },
    { lat: 12.97, lng: 77.61, opens: 1, users: 1 },
  ],
  totals: [{ opens: 6, users: 4 }],
  byHour: [{ _id: 9, opens: 4 }, { _id: 21, opens: 2 }],
  byZone: [
    { areaId: 2, zoneId: 4, opens: 6, users: 4 },
    { areaId: null, zoneId: null, opens: 3, users: 2 },
  ],
};

const matchOf = () => mockMongoFns.aggregate.mock.calls[0][0][0].$match;

beforeEach(() => {
  jest.clearAllMocks();
  areaScope._resetCachesForTests();
  mockMongoFns.aggregate.mockReturnValue(makeCursor([FACET]));
  mockMysqlPool.query.mockImplementation(async (sql) => {
    if (String(sql).includes('FROM areas')) return [AREAS];
    if (String(sql).includes('FROM delivery_zones')) return [ZONES];
    return [[]];
  });
});

describe('GET /api/admin/analytics/heatmap', () => {
  it('an area admin only ever sees app opens IN their own area, for one IST day', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/heatmap?date=2026-09-26')
      .set('Authorization', `Bearer ${areaAdmin}`);

    expect(res.statusCode).toBe(200);
    expect(matchOf()).toEqual({
      // IST midnight to IST midnight.
      createdAt: { $gte: new Date('2026-09-25T18:30:00.000Z'), $lt: new Date('2026-09-26T18:30:00.000Z') },
      loc: { $type: 'object' },
      locAreaId: 2,
    });
    const zoneSql = mockMysqlPool.query.mock.calls.find(([sql]) => sql.includes('FROM delivery_zones'));
    expect(zoneSql[1]).toEqual([2]);

    const { data } = res.body;
    expect(data.points).toEqual(FACET.cells);
    expect(data.totals).toEqual({ opens: 6, users: 4 });
    expect(data.byHour).toHaveLength(24);
    expect(data.byHour[9]).toBe(4);
    expect(data.byHour[21]).toBe(2);
    expect(data.byZone[0]).toMatchObject({ areaCode: 'A2', zoneId: 4, zoneName: 'Koramangala', outside: false, opens: 6 });
    expect(data.zones).toEqual([expect.objectContaining({ id: 4, areaId: 2, name: 'Koramangala', boundary: expect.any(Array) })]);
  });

  it('super admin on "All areas" sees every area and the opens outside every zone', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/heatmap?date=2026-09-26')
      .set('Authorization', `Bearer ${superAdmin}`)
      .set('X-Area-Id', 'all');

    expect(res.statusCode).toBe(200);
    expect(matchOf()).not.toHaveProperty('locAreaId');
    expect(res.body.data.byZone[1]).toMatchObject({ areaId: null, outside: true, zoneName: null, opens: 3 });
  });

  it('super admin with no area picked gets a 400, not a silent default', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/heatmap')
      .set('Authorization', `Bearer ${superAdmin}`);
    expect(res.statusCode).toBe(400);
    expect(mockMongoFns.aggregate).not.toHaveBeenCalled();
  });

  it('days widens the range back from the chosen day, capped at the 30 days sessions live', async () => {
    await request(app)
      .get('/api/admin/analytics/heatmap?date=2026-09-26&days=90')
      .set('Authorization', `Bearer ${areaAdmin}`);
    const { $gte, $lt } = matchOf().createdAt;
    expect(($lt - $gte) / (24 * 60 * 60 * 1000)).toBe(30);
  });

  it('a bad date falls back to today instead of erroring', async () => {
    const res = await request(app)
      .get('/api/admin/analytics/heatmap?date=yesterday')
      .set('Authorization', `Bearer ${areaAdmin}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('MongoDB down is an empty map, never a 500', async () => {
    getDb.mockImplementationOnce(() => { throw new Error('not connected'); });
    const res = await request(app)
      .get('/api/admin/analytics/heatmap?date=2026-09-26')
      .set('Authorization', `Bearer ${areaAdmin}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.points).toEqual([]);
    expect(res.body.data.totals).toEqual({ opens: 0, users: 0 });
  });
});
