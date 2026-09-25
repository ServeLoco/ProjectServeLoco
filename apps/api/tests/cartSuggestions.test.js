const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));

// Area resolution has its own tests; here every request is in area 1.
jest.mock('../src/middleware/areaMiddleware', () => ({
  resolveCustomerArea: (req, res, next) => {
    req.areaId = 1;
    next();
  },
}));

const { pool } = require('../src/db/mysql');
const microCache = require('../src/utils/microCache');
const { istHour } = require('../src/utils/businessTime');
const cartRoutes = require('../src/routes/cartRoutes');

const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);
const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

// Catalogue: 3 Burger (Fast Food 30), 10 Matar Paneer (Curries 70),
// 1 Coke / 13 Pepsi / 14 Sprite (Drinks 10), 8 Fries (Snacks 20),
// 9 Roti / 11 Naan (Breads 80), 6 Milk (Dairy 60).
const PRODUCTS = {
  1: { name: 'Coke', category_id: 10 },
  3: { name: 'Burger', category_id: 30 },
  6: { name: 'Milk', category_id: 60 },
  8: { name: 'Fries', category_id: 20 },
  9: { name: 'Roti', category_id: 80 },
  10: { name: 'Matar Paneer', category_id: 70 },
  11: { name: 'Naan', category_id: 80 },
  13: { name: 'Pepsi', category_id: 10 },
  14: { name: 'Sprite', category_id: 10 },
};
const productRow = (id) => ({
  id, ...PRODUCTS[id], price: '50.00', available: 1, deleted: 0, is_combo: 0,
  image_id: null, available_from_time: null, available_until_time: null,
});

let db;
const answer = (sql, params) => {
  if (sql.includes('FROM product_pairs')) {
    return db.pairs.filter((p) => params[1].includes(p.product_id));
  }
  if (sql.includes('FROM category_pairs')) {
    return db.categoryPairs.filter((p) => params[1].includes(p.category_id));
  }
  if (sql.includes('SELECT id, category_id FROM products')) {
    return params[1].map((id) => ({ id, category_id: PRODUCTS[id].category_id }));
  }
  if (sql.includes('ORDER BY orders DESC')) return db.topSellers;
  if (sql.includes('LEFT JOIN categories cat')) {
    return params[0].filter((id) => PRODUCTS[id] && !db.unavailable.includes(id)).map(db.rowFor);
  }
  if (sql.includes('customer_id = ?')) return db.personal;
  if (sql.includes('FROM product_variants')) return [];
  return [];
};

const get = (query) => request(app)
  .get(`/api/cart/suggestions?${query}`)
  .set('Authorization', `Bearer ${token}`);

const names = (res) => res.body.products.map((p) => p.name);

beforeEach(() => {
  microCache.clearAll();
  db = {
    pairs: [
      { product_id: 3, paired_product_id: 1, score: 0.9 },  // Burger → Coke
      { product_id: 3, paired_product_id: 8, score: 0.8 },  // Burger → Fries
      { product_id: 3, paired_product_id: 13, score: 0.7 }, // Burger → Pepsi
      { product_id: 3, paired_product_id: 14, score: 0.6 }, // Burger → Sprite
      { product_id: 10, paired_product_id: 9, score: 0.9 }, // Matar Paneer → Roti
      { product_id: 10, paired_product_id: 11, score: 0.7 }, // Matar Paneer → Naan
      { product_id: 10, paired_product_id: 1, score: 0.3 },  // Matar Paneer → Coke
    ],
    categoryPairs: [],
    topSellers: [{ product_id: 6, orders: 50 }],
    personal: [],
    unavailable: [],
    rowFor: productRow,
  };
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => [answer(sql, params)]);
});

describe('GET /api/cart/suggestions', () => {
  it('suggests what goes with the cart, best first, in both casings', async () => {
    const res = await get('productIds=3');
    expect(res.status).toBe(200);
    expect(names(res).slice(0, 3)).toEqual(['Coke', 'Fries', 'Pepsi']);
    expect(res.body.data.products).toEqual(res.body.products);
    const coke = res.body.products[0];
    expect(coke).toMatchObject({ id: 1, categoryId: 10, has_variants: false, hasVariants: false });
    expect(coke).toHaveProperty('min_price');
    expect(coke).toHaveProperty('minPrice');
  });

  it('adds up votes: an item that goes with two cart items ranks higher', async () => {
    // Coke is matched by both Burger (0.9) and Matar Paneer (0.3) = 1.2.
    const res = await get('productIds=3,10');
    expect(names(res)[0]).toBe('Coke');
    expect(names(res)).toEqual(expect.arrayContaining(['Roti', 'Fries']));
  });

  it('shows at most 2 from one category', async () => {
    const res = await get('productIds=3');
    const drinks = res.body.products.filter((p) => p.categoryId === 10);
    expect(drinks).toHaveLength(2); // Coke, Pepsi — not Sprite
  });

  it('never suggests what is already in the cart', async () => {
    const res = await get('productIds=3,1');
    expect(names(res)).not.toContain('Coke');
    expect(names(res)).not.toContain('Burger');
  });

  it('skips products that cannot be bought right now', async () => {
    db.unavailable = [1];
    // Fries only sell in a one-hour slot that starts two hours from now (IST).
    const hour = (istHour(new Date()) + 2) % 24;
    const slot = (h) => `${String(h % 24).padStart(2, '0')}:00:00`;
    db.rowFor = (id) => (id === 8
      ? { ...productRow(id), available_from_time: slot(hour), available_until_time: slot(hour + 1) }
      : productRow(id));
    const res = await get('productIds=3');
    expect(names(res)).not.toContain('Coke');
    expect(names(res)).not.toContain('Fries');
  });

  it('fills the row with best sellers when nothing is learned yet', async () => {
    db.pairs = [];
    const res = await get('productIds=3');
    expect(names(res)).toEqual(['Milk']);
  });

  it('uses learned category pairs when the product itself has no matches', async () => {
    db.pairs = [];
    db.categoryPairs = [{ category_id: 70, paired_category_id: 80, score: 1.4 }]; // Curries → Breads
    db.topSellers = [{ product_id: 6, orders: 50 }, { product_id: 11, orders: 20 }];
    const res = await get('productIds=10');
    expect(names(res)).toEqual(['Naan', 'Milk']);
  });

  it("boosts what this customer usually orders when it goes with the cart", async () => {
    // Sprite 0.6 × 1.5 + half of the best (Coke 0.9) = 1.35 — above Coke.
    db.personal = [{ product_id: 14, times: 4 }];
    const res = await get('productIds=3');
    expect(names(res).slice(0, 2)).toEqual(['Sprite', 'Coke']);
  });

  it("does not push in a habit that has nothing to do with the cart", async () => {
    // Milk is only a best seller here — no pair, no partner category.
    db.personal = [{ product_id: 6, times: 4 }];
    const res = await get('productIds=3');
    expect(names(res).indexOf('Milk')).toBe(names(res).length - 1);
  });

  it('returns an empty list for an empty cart without touching the database', async () => {
    const res = await get('productIds=');
    expect(res.body.products).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns an empty list, not an error, when the database fails', async () => {
    pool.query.mockRejectedValue(new Error('db down'));
    const res = await get('productIds=3');
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('serves a repeat cart from cache', async () => {
    await get('productIds=3');
    const callsAfterFirst = pool.query.mock.calls.length;
    await get('productIds=3');
    // Only the per-customer history is read again.
    expect(pool.query.mock.calls.length - callsAfterFirst).toBe(1);
  });

  it('needs a customer login', async () => {
    const res = await request(app).get('/api/cart/suggestions?productIds=3');
    expect(res.status).toBe(401);
  });
});
