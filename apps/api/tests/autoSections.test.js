/**
 * Rows Home creates by itself (a row per shop, then a row per category).
 * They are stored as ordinary dashboard_sections rows, so the admin can
 * reorder / hide / time them like any other section.
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../src/db/mysql');
const { syncAutoSections, isAutoRowVisible } = require('../src/utils/autoSections');

beforeEach(() => {
  jest.resetAllMocks();
});

const SHOPS = [{ id: 4, name: 'Hot Bites', has_available: 1 }, { id: 9, name: 'Sweet Spot', has_available: 0 }];
const CATEGORIES = [{ id: 12, name: 'Burgers', has_available: 1 }];

describe('syncAutoSections', () => {
  it('creates a row for each new shop then category, after everything already in the list', async () => {
    pool.query
      .mockResolvedValueOnce([SHOPS]) // shops
      .mockResolvedValueOnce([CATEGORIES]) // categories
      .mockResolvedValueOnce([[]]) // existing auto rows: none
      .mockResolvedValueOnce([[{ max_order: 5 }]]) // current max display_order
      .mockResolvedValue([{}]); // inserts

    const { valid, unavailable } = await syncAutoSections(1, 'fast_food');

    expect([...valid].sort()).toEqual(['category:12', 'shop:4', 'shop:9']);
    // Sweet Spot has nothing sellable — flagged so Home can put it last from the start.
    expect([...unavailable]).toEqual(['shop:9']);
    const inserts = pool.query.mock.calls.filter(([sql]) => /INSERT IGNORE INTO dashboard_sections/.test(sql));
    expect(inserts).toHaveLength(3);
    // area, title, slug, store type, display_order, max items, kind, source id
    expect(inserts[0][1]).toEqual([1, 'Hot Bites', 'auto-shop-4', 'fast_food', 6, 8, 'shop', 4]);
    expect(inserts[1][1]).toEqual([1, 'Sweet Spot', 'auto-shop-9', 'fast_food', 7, 8, 'shop', 9]);
    expect(inserts[2][1]).toEqual([1, 'Burgers', 'auto-category-12', 'fast_food', 8, 8, 'category', 12]);
  });

  it('leaves existing rows (and their order) alone, renames on a shop rename, never revives a deleted row', async () => {
    pool.query
      .mockResolvedValueOnce([SHOPS])
      .mockResolvedValueOnce([CATEGORIES])
      .mockResolvedValueOnce([[
        { id: 70, auto_kind: 'shop', auto_source_id: 4, title: 'Old Name', deleted_at: null },
        { id: 71, auto_kind: 'shop', auto_source_id: 9, title: 'Sweet Spot', deleted_at: '2026-09-01' }, // admin deleted it
        { id: 72, auto_kind: 'category', auto_source_id: 12, title: 'Burgers', deleted_at: null },
      ]])
      .mockResolvedValue([{}]);

    await syncAutoSections(1, 'fast_food');

    const sqls = pool.query.mock.calls.map(([sql]) => sql);
    expect(sqls.some((sql) => /INSERT/.test(sql))).toBe(false); // nothing created
    const updates = pool.query.mock.calls.filter(([sql]) => /UPDATE dashboard_sections SET title/.test(sql));
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual(['Hot Bites', 70, 1]);
  });

  it('scopes every read to the area and the shop mode', async () => {
    pool.query.mockResolvedValue([[]]);
    await syncAutoSections(7, 'packed');
    const [shopSql, shopParams] = pool.query.mock.calls[0];
    const [catSql, catParams] = pool.query.mock.calls[1];
    expect(shopSql).toContain('s.area_id = ?');
    // shop mode (availability check), area, shop mode (which shops qualify)
    expect(shopParams).toEqual(['packed', 7, 'packed']);
    expect(catSql).toContain('c.area_id = ?');
    expect(catParams).toEqual([7, 'packed']);
  });

  it('does nothing for "all" or no mode', async () => {
    expect((await syncAutoSections(1, 'all')).valid.size).toBe(0);
    expect((await syncAutoSections(1, undefined)).valid.size).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('never throws — a failure just means no automatic rows', async () => {
    pool.query.mockRejectedValue(new Error('db down'));
    const { valid, unavailable } = await syncAutoSections(1, 'packed');
    expect(valid.size).toBe(0);
    expect(unavailable.size).toBe(0);
  });
});

describe('isAutoRowVisible', () => {
  const valid = new Set(['shop:4']);
  it('always shows the admin\'s own sections', () => {
    expect(isAutoRowVisible({ auto_kind: null }, valid)).toBe(true);
  });
  it('shows an auto row only while its shop/category still qualifies', () => {
    expect(isAutoRowVisible({ auto_kind: 'shop', auto_source_id: 4 }, valid)).toBe(true);
    expect(isAutoRowVisible({ auto_kind: 'shop', auto_source_id: 5 }, valid)).toBe(false);
    expect(isAutoRowVisible({ auto_kind: 'category', auto_source_id: 4 }, valid)).toBe(false);
  });
});

describe('availability of an automatic row', () => {
  it('a shop row counts only sellable items (switched on, shop open, group active)', async () => {
    pool.query.mockResolvedValue([[]]);
    await syncAutoSections(1, 'packed');
    const shopSql = pool.query.mock.calls[0][0];
    expect(shopSql).toContain('s.is_open = 1');
    expect(shopSql).toContain('p.available = 1');
    expect(shopSql).toContain('product_groups');
    const categorySql = pool.query.mock.calls[1][0];
    expect(categorySql).toContain('sh.is_open = 1');
    expect(categorySql).toContain('p.available = 1');
  });
});
