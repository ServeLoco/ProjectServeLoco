/**
 * Automatic shop/category rows in the public dashboard: they come back in the
 * admin's display order, mixed in with the admin's own sections, with no
 * items (the app loads those itself) — and only while their shop/category
 * still has something to sell.
 */
const request = require('supertest');
const express = require('express');
const dashboardRoutes = require('../src/routes/dashboardRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/db/mongodb', () => ({
  getDb: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRoutes);

const { clearAll: clearMicroCache } = require('../src/utils/microCache');
const areaScope = require('../src/utils/areaScope');

const DEFAULT_AREA = { id: 1, code: 'A1', name: 'Area 1', active: 1, is_default: 1 };

const sectionRow = (over) => ({
  id: 1, title: 'x', slug: 'x', section_type: 'product_block', store_type: 'packed',
  active: 1, display_order: 0, max_visible_items: 8, show_see_all: 0, show_hot_badge: 0,
  section_icon: null, auto_kind: null, auto_source_id: null,
  linked_category_id: null, linked_offer_id: null, starts_at: null, ends_at: null, version: 1,
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  clearMicroCache();
  areaScope._resetCachesForTests();
});

describe('GET /api/dashboard — automatic rows', () => {
  it('returns an auto row as a descriptor with no items, in the admin\'s display order', async () => {
    pool.query
      .mockResolvedValueOnce([[DEFAULT_AREA]]) // resolveCustomerArea
      .mockResolvedValueOnce([[{ id: 4, name: 'Hot Bites' }]]) // shops that qualify
      .mockResolvedValueOnce([[]]) // categories that qualify
      .mockResolvedValueOnce([[{ id: 70, auto_kind: 'shop', auto_source_id: 4, title: 'Hot Bites', deleted_at: null }]]) // existing auto rows
      .mockResolvedValueOnce([[
        sectionRow({ id: 70, title: 'Hot Bites', slug: 'auto-shop-4', display_order: 0, auto_kind: 'shop', auto_source_id: 4, show_hot_badge: 1, section_icon: 'star' }),
      ]]); // sections

    const res = await request(app).get('/api/dashboard?storeType=packed');

    expect(res.statusCode).toBe(200);
    const [row] = res.body.data.sections;
    expect(row).toMatchObject({
      id: 70, title: 'Hot Bites', sectionType: 'product_block', auto: true,
      autoKind: 'shop', sourceId: 4, items: [], maxVisibleItems: 8,
      showHotBadge: true, sectionIcon: 'star',
    });
  });

  it('hides an auto row whose shop no longer sells anything in this mode', async () => {
    pool.query
      .mockResolvedValueOnce([[DEFAULT_AREA]])
      .mockResolvedValueOnce([[]]) // no shop qualifies any more
      .mockResolvedValueOnce([[]]) // no category qualifies
      .mockResolvedValueOnce([[
        sectionRow({ id: 70, slug: 'auto-shop-4', auto_kind: 'shop', auto_source_id: 4 }),
      ]]);

    const res = await request(app).get('/api/dashboard?storeType=packed');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sections).toEqual([]);
  });
});

describe('editing an automatic row', () => {
  const { updateAdminSection } = require('../src/controllers/dashboardController');
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('refuses to move it to another shop mode (the sync would just re-create it)', async () => {
    pool.query.mockResolvedValueOnce([[
      sectionRow({ id: 70, store_type: 'packed', auto_kind: 'shop', auto_source_id: 4, version: 1 }),
    ]]);
    const res = mockRes();
    await updateAdminSection({ areaId: 1, params: { id: '70' }, body: { store_type: 'fast_food', version: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('lets order, visibility, timing and the other settings change like any section', async () => {
    pool.query
      .mockResolvedValueOnce([[sectionRow({ id: 70, store_type: 'packed', auto_kind: 'shop', auto_source_id: 4, version: 1 })]])
      .mockResolvedValue([{}]);
    const res = mockRes();
    await updateAdminSection({ areaId: 1, params: { id: '70' }, body: { active: 0, max_visible_items: 5, show_hot_badge: true, version: 1 } }, res);
    expect(res.status).not.toHaveBeenCalledWith(400);
    const update = pool.query.mock.calls.find(([sql]) => /UPDATE dashboard_sections SET/.test(sql));
    expect(update).toBeTruthy();
    expect(update[1]).toEqual(expect.arrayContaining([0, 5, 1]));
  });
});
