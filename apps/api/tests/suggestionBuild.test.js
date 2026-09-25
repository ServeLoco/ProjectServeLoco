jest.mock('../src/db/mysql', () => {
  const connection = {
    beginTransaction: jest.fn().mockResolvedValue(),
    query: jest.fn().mockResolvedValue([{}]),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
  return {
    pool: { query: jest.fn(), getConnection: jest.fn().mockResolvedValue(connection) },
    __connection: connection,
  };
});

const mockEvents = { rows: [] };
jest.mock('../src/db/mongodb', () => ({
  getDb: () => ({
    collection: () => ({ aggregate: () => ({ toArray: async () => mockEvents.rows }) }),
  }),
}));

jest.mock('../src/utils/areaScope', () => ({
  listAreas: jest.fn().mockResolvedValue([{ id: 1, active: 1 }]),
}));

const { pool, __connection: connection } = require('../src/db/mysql');
const { buildAreaPairs, buildAllPairs } = require('../src/services/suggestions/buildPairs');

// Queue the six reads buildAreaPairs makes, in order.
const queueReads = ({ productPairs = [], categoryPairs = [], catalogue = [] } = {}) => {
  pool.query
    .mockResolvedValueOnce([[{ weight: 100 }]])                                   // totals
    .mockResolvedValueOnce([[{ item_id: 1, weight: 30 }, { item_id: 2, weight: 20 }]]) // product weights
    .mockResolvedValueOnce([productPairs])
    .mockResolvedValueOnce([[{ item_id: 7, weight: 40 }, { item_id: 8, weight: 30 }]]) // category weights
    .mockResolvedValueOnce([categoryPairs])
    .mockResolvedValueOnce([catalogue]);
};

describe('buildAreaPairs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads delivered orders of that area only and replaces its rows in one transaction', async () => {
    queueReads({
      productPairs: [
        { productId: 1, pairedId: 2, coCount: 15, weighted: 15 },
        { productId: 2, pairedId: 1, coCount: 15, weighted: 15 },
      ],
      categoryPairs: [{ productId: 7, pairedId: 8, coCount: 20, weighted: 20 }],
      catalogue: [
        { id: 1, name: 'Aloo Tikki Burger', category_id: 7 },
        { id: 2, name: 'Coke', category_id: 8 },
        { id: 3, name: 'Cheese Burger', category_id: 7 },
      ],
    });

    const result = await buildAreaPairs(1);

    const pairSql = pool.query.mock.calls[2][0];
    expect(pairSql).toMatch(/o\.status = 'Delivered'/);
    expect(pairSql).toMatch(/o\.area_id = \?/);
    expect(pool.query.mock.calls[2][1]).toEqual([1, 1, 2]);

    expect(result).toMatchObject({ areaId: 1, learnedProducts: 2, borrowedProducts: 1, categoryRows: 1 });

    const writes = connection.query.mock.calls.map((call) => call[0]);
    expect(writes[0]).toBe('DELETE FROM product_pairs WHERE area_id = ?');
    const productInsert = connection.query.mock.calls[1][1][0];
    // Cheese Burger (3) borrowed Aloo Tikki Burger's match (Coke) as 'similar'.
    expect(productInsert).toEqual(expect.arrayContaining([
      expect.arrayContaining([1, 3, 2, expect.any(Number), 0, 'similar']),
    ]));
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });

  it("clears the area's cached cart suggestions once the new pairs are in", async () => {
    const microCache = require('../src/utils/microCache');
    microCache.set('suggest:1:3', [{ stale: true }], 60_000);
    microCache.set('suggest:2:3', [{ other: true }], 60_000);
    queueReads();
    await buildAreaPairs(1);
    expect(microCache.get('suggest:1:3')).toBeUndefined();
    expect(microCache.get('suggest:2:3')).toEqual([{ other: true }]);
  });

  it('rolls back and keeps the old rows when a write fails', async () => {
    queueReads({ productPairs: [{ productId: 1, pairedId: 2, coCount: 15, weighted: 15 }] });
    connection.query.mockRejectedValueOnce(new Error('db down'));

    await expect(buildAreaPairs(1)).rejects.toThrow('db down');
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });
});

describe('feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.rows = [];
  });

  it('lets cart-row feedback reorder learned matches', async () => {
    // Burger (1) goes with Coke (2) and Fries (3) about equally from orders,
    // but people skip Coke in the row and take Fries.
    pool.query
      .mockResolvedValueOnce([[{ weight: 100 }]])
      .mockResolvedValueOnce([[{ item_id: 1, weight: 30 }, { item_id: 2, weight: 20 }, { item_id: 3, weight: 20 }]])
      .mockResolvedValueOnce([[
        { productId: 1, pairedId: 2, coCount: 15, weighted: 15 },
        { productId: 1, pairedId: 3, coCount: 14, weighted: 14 },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);
    mockEvents.rows = [
      { _id: { productId: 2, type: 'suggestion_impression' }, count: 300 },
      { _id: { productId: 3, type: 'suggestion_impression' }, count: 300 },
      { _id: { productId: 3, type: 'suggestion_add' }, count: 60 },
    ];

    const result = await buildAreaPairs(1);

    expect(result.feedbackProducts).toBe(2);
    const inserted = connection.query.mock.calls[1][1][0].filter((row) => row[1] === 1);
    expect(inserted.map((row) => row[2])).toEqual([3, 2]);
  });
});

describe('buildAllPairs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs and carries on when an area fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('boom'));
    await expect(buildAllPairs()).resolves.toEqual([]);
  });
});
