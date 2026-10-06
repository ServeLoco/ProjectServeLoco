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
  orders_count: 4,
  ratings_count: 2,
  stars_missing: '5', // 2 ratings: 1 star (4 missing) + 4 stars (1 missing)
  rated_avg: '2.5',
  low_ratings: '1',
  ...overrides,
});

describe('getFoodRatingsReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
  });

  it('counts every delivered order line, unrated ones as 5 stars, and answers in both casings', async () => {
    pool.query.mockResolvedValueOnce([[ratingRow()]]);
    const res = mockRes();

    await getFoodRatingsReport({ areaId: 3, query: { period: 'month' } }, res);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM orders o\s+JOIN order_items oi ON oi\.order_id = o\.id\s+LEFT JOIN order_item_ratings r/);
    expect(sql).toMatch(/WHERE o\.status = 'Delivered'/);
    expect(sql).toMatch(/AND o\.area_id = \?/);
    expect(params).toEqual([3]);
    expect(res.status).toHaveBeenCalledWith(200);
    const [row] = res.json.mock.calls[0][0].data;
    // (2 unrated x 5 + 1 + 4) / 4 = 3.75 -> 3.8
    expect(row).toEqual(expect.objectContaining({
      productName: 'Paneer Tikka',
      product_name: 'Paneer Tikka',
      rating: 3.8,
      fire: false,
      ratedAvg: 2.5,
      rated_avg: 2.5,
      ordersCount: 4,
      orders_count: 4,
      ratingsCount: 2,
      ratings_count: 2,
      lowRatings: 1,
      low_ratings: 1,
    }));
    expect(row).not.toHaveProperty('stars_missing');
  });

  it('sorts the lowest shown rating first, then the worst real stars', async () => {
    pool.query.mockResolvedValueOnce([[
      ratingRow({ product_id: 1, product_name: 'Never rated', ratings_count: 0, stars_missing: '0', rated_avg: null, low_ratings: '0' }),
      ratingRow({ product_id: 2, product_name: 'Floor A', orders_count: 1, ratings_count: 1, stars_missing: '3', rated_avg: '2.0' }),
      ratingRow({ product_id: 3, product_name: 'Floor B', orders_count: 1, ratings_count: 1, stars_missing: '4', rated_avg: '1.0' }),
    ]]);
    const res = mockRes();

    await getFoodRatingsReport({ areaId: 3, query: {} }, res);

    const data = res.json.mock.calls[0][0].data;
    expect(data.map((r) => r.productName)).toEqual(['Floor B', 'Floor A', 'Never rated']);
    expect(data.map((r) => r.rating)).toEqual([3.5, 3.5, 5]);
    expect(data[2]).toEqual(expect.objectContaining({ fire: true, ratedAvg: null }));
  });

  it("groups by area and adds area codes in super admin's 'all' view", async () => {
    listAreas.mockResolvedValue([{ id: 1, code: 'HSR' }, { id: 2, code: 'KRM' }]);
    pool.query.mockResolvedValueOnce([[ratingRow({ area_id: 2 })]]);
    const res = mockRes();

    await getFoodRatingsReport({ areaId: 'all', query: {} }, res);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/GROUP BY o\.area_id, oi\.item_type, oi\.product_id/);
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
