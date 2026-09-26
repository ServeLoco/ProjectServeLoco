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
const { invalidateStoreModeCache } = require('../src/utils/storeMode');
const { istHour } = require('../src/utils/businessTime');
const cartRoutes = require('../src/routes/cartRoutes');

const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);
const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

// Catalogue: 3 Burger (Fast Food 30), 10 Matar Paneer (Curries 70),
// 1 Coke / 13 Pepsi / 14 Sprite (Drinks 10), 8 Fries (Snacks 20),
// 9 Roti / 11 Naan (Breads 80) — all in the fast_food shop mode, Burger and
// Fries from shop 5. 6 Milk (Dairy 60) is in the packed mode.
const PRODUCTS = {
  1: { name: 'Coke', category_id: 10 },
  3: { name: 'Burger', category_id: 30, shop_id: 5 },
  6: { name: 'Milk', category_id: 60, mode: 'packed' },
  8: { name: 'Fries', category_id: 20, shop_id: 5 },
  9: { name: 'Roti', category_id: 80 },
  10: { name: 'Matar Paneer', category_id: 70 },
  11: { name: 'Naan', category_id: 80 },
  13: { name: 'Pepsi', category_id: 10 },
  14: { name: 'Sprite', category_id: 10 },
};
const modeOf = (id) => PRODUCTS[id].mode || 'fast_food';
const shopOf = (id) => PRODUCTS[id].shop_id ?? null;
const productRow = (id) => ({
  id, name: PRODUCTS[id].name, category_id: PRODUCTS[id].category_id, shop_id: shopOf(id),
  category_type: modeOf(id), price: '50.00', available: 1, deleted: 0, is_combo: 0,
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
  if (sql.includes('SELECT p.id, p.category_id, p.shop_id')) {
    return params[1].map((id) => ({ id, category_id: PRODUCTS[id].category_id, shop_id: shopOf(id), mode: modeOf(id) }));
  }
  if (sql.includes('ORDER BY orders DESC')) return db.topSellers;
  if (sql.includes('c.type IN (?)')) {
    // Any sellable product not in the cart: most ordered first, then the
    // cart's own shop, then its mode.
    const [cartIds, liveModes, , shopIds, noShop, modes] = params;
    const sales = (id) => (db.topSellers.find((t) => t.product_id === id) || {}).orders || 0;
    const same = (id) => (shopOf(id) == null ? Boolean(noShop) : shopIds.includes(shopOf(id)));
    return Object.keys(PRODUCTS).map(Number)
      .filter((id) => !cartIds.includes(id) && !db.unavailable.includes(id) && liveModes.includes(modeOf(id)))
      .sort((a, b) => sales(b) - sales(a)
        || Number(same(b)) - Number(same(a))
        || Number(modes.includes(modeOf(b))) - Number(modes.includes(modeOf(a)))
        || a - b)
      .map((id) => ({ id }));
  }
  if (sql.includes('JOIN categories cat ON')) {
    return params[0]
      .filter((id) => PRODUCTS[id] && !db.unavailable.includes(id) && params[1].includes(modeOf(id)))
      .map(db.rowFor);
  }
  if (sql.includes('FROM store_modes')) return db.liveModes.map((slug) => ({ slug }));
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
  invalidateStoreModeCache(1);
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
    liveModes: ['packed', 'fast_food'],
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
    const res = await get('productIds=3&limit=5');
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

  it('fills the row with the most ordered, from any shop, when nothing is learned yet', async () => {
    db.pairs = [];
    db.topSellers = [{ product_id: 6, orders: 90 }, { product_id: 11, orders: 50 }, { product_id: 1, orders: 20 }];
    const res = await get('productIds=3');
    // Most ordered first — Milk too, though it is another mode. Never-ordered
    // items follow: the burger's own shop (Fries), then its mode; Sprite, a
    // third drink, only closes the row.
    expect(names(res)).toEqual(['Milk', 'Naan', 'Coke', 'Fries', 'Roti', 'Matar Paneer', 'Pepsi', 'Sprite']);
  });

  it('shows 9 by default: related first, then the most ordered', async () => {
    PRODUCTS[2] = { name: 'Bread', category_id: 61, mode: 'packed' };
    try {
      const res = await get('productIds=3');
      expect(names(res)).toHaveLength(9);
      expect(names(res).slice(0, 4)).toEqual(['Coke', 'Fries', 'Pepsi', 'Milk']);
    } finally {
      delete PRODUCTS[2];
    }
  });

  it('keeps the row filled after the related items run out', async () => {
    const res = await get('productIds=3');
    expect(names(res).slice(0, 3)).toEqual(['Coke', 'Fries', 'Pepsi']);
    // Milk, the best seller, comes right after the related items.
    expect(names(res)[3]).toBe('Milk');
    // Everything else in the catalogue, so the row is as full as it can be.
    expect(names(res)).toHaveLength(8);
  });

  it('repeats a category rather than show a short row', async () => {
    // Only drinks and Milk are left to show.
    db.pairs = [];
    db.unavailable = [8, 9, 10, 11];
    const res = await get('productIds=3');
    expect(names(res)).toEqual(['Milk', 'Coke', 'Pepsi', 'Sprite']);
  });

  it('uses learned category pairs when the product itself has no matches', async () => {
    db.pairs = [];
    db.categoryPairs = [{ category_id: 70, paired_category_id: 80, score: 1.4 }]; // Curries → Breads
    db.topSellers = [{ product_id: 6, orders: 50 }, { product_id: 11, orders: 20 }];
    const res = await get('productIds=10');
    expect(names(res).slice(0, 3)).toEqual(['Naan', 'Roti', 'Milk']);
  });

  it('puts the best seller first for a cart with nothing learned', async () => {
    db.pairs = [];
    PRODUCTS[2] = { name: 'Bread', category_id: 61, mode: 'packed' };
    try {
      const res = await get('productIds=2');
      expect(names(res)[0]).toBe('Milk');
      expect(names(res)).toHaveLength(9);
      expect(names(res)).not.toContain('Bread');
    } finally {
      delete PRODUCTS[2];
    }
  });

  it('never shows a switched-off shop mode, even its best seller', async () => {
    db.liveModes = ['fast_food']; // the admin turned the packed mode off
    const res = await get('productIds=3');
    expect(names(res)).not.toContain('Milk');
    expect(names(res).slice(0, 3)).toEqual(['Coke', 'Fries', 'Pepsi']);
  });

  it("boosts what this customer usually orders when it goes with the cart", async () => {
    // Sprite 0.6 × 1.5 + half of the best (Coke 0.9) = 1.35 — above Coke.
    db.personal = [{ product_id: 14, times: 4 }];
    const res = await get('productIds=3');
    expect(names(res).slice(0, 2)).toEqual(['Sprite', 'Coke']);
  });

  it("does not push in a habit that has nothing to do with the cart", async () => {
    // Matar Paneer is only filler here — no pair, no partner category.
    db.personal = [{ product_id: 10, times: 4 }];
    const res = await get('productIds=3');
    expect(names(res).slice(0, 3)).toEqual(['Coke', 'Fries', 'Pepsi']);
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
