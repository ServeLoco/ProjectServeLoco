/**
 * GET /api/admin/reports/ratings — food ratings per item for the admin
 * Reports page (adminController.getFoodRatingsReport). The controller is
 * called directly with req.areaId set the way resolveAdminArea leaves it.
 */
const { pool } = require('../src/db/mysql');
const { listAreas } = require('../src/utils/areaScope');
const { getFoodRatingsReport } = require('../src/controllers/adminController');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
  beginReadCommitted: jest.fn(),
}));
jest.mock('../src/utils/areaScope', () => ({
  ...jest.requireActual('../src/utils/areaScope'),
  listAreas: jest.fn(),
}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const ratingRow = (overrides = {}) => ({
  item_type: 'product',
  product_id: 55,
  product_name: 'Paneer Tikka',
  avg_stars: '2.5',
  ratings_count: 4,
  low_ratings: '2',
  ...overrides,
});

describe('getFoodRatingsReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it("scopes one area's ratings and answers in camelCase and snake_case", async () => {
    pool.query.mockResolvedValueOnce([[ratingRow()]]);
    const res = mockRes();

    await getFoodRatingsReport({ areaId: 3, query: { period: 'month' } }, res);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM order_item_ratings r\s+JOIN order_items oi ON oi\.id = r\.order_item_id/);
    expect(sql).toMatch(/AND r\.area_id = \?/);
    expect(sql).toMatch(/ORDER BY avg_stars ASC, ratings_count DESC/);
    expect(params).toEqual([3]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual([expect.objectContaining({
      productName: 'Paneer Tikka',
      product_name: 'Paneer Tikka',
      itemType: 'product',
      item_type: 'product',
      avgStars: 2.5,
      avg_stars: 2.5,
      ratingsCount: 4,
      ratings_count: 4,
      lowRatings: 2,
      low_ratings: 2,
    })]);
  });

  it("groups by area and adds area codes in super admin's 'all' view", async () => {
    listAreas.mockResolvedValue([{ id: 1, code: 'HSR' }, { id: 2, code: 'KRM' }]);
    pool.query.mockResolvedValueOnce([[ratingRow({ area_id: 2 })]]);
    const res = mockRes();

    await getFoodRatingsReport({ areaId: 'all', query: {} }, res);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/GROUP BY r\.area_id, r\.item_type, r\.product_id/);
    expect(params).toEqual([]);
    expect(res.json.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({ areaCode: 'KRM', area_code: 'KRM' }));
  });

  it('rejects an unknown period', async () => {
    const res = mockRes();

    await getFoodRatingsReport({ areaId: 3, query: { period: 'year' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('asks a super admin with no area picked to choose one', async () => {
    const res = mockRes();

    await getFoodRatingsReport({ areaId: null, query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
