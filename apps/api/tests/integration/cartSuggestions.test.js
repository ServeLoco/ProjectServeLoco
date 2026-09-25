// Cart "Add more" suggestions end to end against a REAL MySQL: the nightly
// build's SQL (self-join, recency weight, status/area/window filters) and the
// read path's sellable filters are database behaviour a mocked pool can't
// prove. Each run builds its own two areas so it never touches — and is never
// touched by — any other fixture in the test database.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Feedback lives in MongoDB, which CI doesn't run; the aggregation's shape is
// covered in suggestionBuild.test.js. Here it answers whatever a test sets.
const mockFeedback = { rows: [] };
jest.mock('../../src/db/mongodb', () => ({
  getDb: () => ({
    collection: () => ({ aggregate: () => ({ toArray: async () => mockFeedback.rows }) }),
  }),
}));

// Area resolution has its own tests; the test picks the area per request.
jest.mock('../../src/middleware/areaMiddleware', () => ({
  resolveCustomerArea: (req, res, next) => {
    req.areaId = Number(req.headers['x-test-area']);
    next();
  },
}));

const {
  describeWithMysql,
  assertMysqlReady,
  pool,
  FIXTURE_TAG,
} = require('../helpers/realMysql');
const { buildAreaPairs } = require('../../src/services/suggestions/buildPairs');
const { istHour } = require('../../src/utils/businessTime');
const microCache = require('../../src/utils/microCache');
const cartRoutes = require('../../src/routes/cartRoutes');
const { getCartSuggestions } = require('../../src/controllers/suggestionController');

const app = express();
app.use('/api/cart', cartRoutes);

const tokenFor = (userId) => jwt.sign({ id: userId, role: 'customer' }, process.env.JWT_SECRET || 'secret');

describeWithMysql('cart suggestions against a real database', () => {
  const area = {};
  const other = {};
  const cat = {};
  const p = {};
  let buyer;
  let loyalSpriteBuyer;
  let orderSeq = 0;

  const insert = async (sql, params) => (await pool.query(sql, params))[0].insertId;

  const createArea = (suffix) => insert(
    'INSERT INTO areas (code, name, active) VALUES (?, ?, 1)',
    [`${FIXTURE_TAG}${suffix}`.slice(0, 16), `${FIXTURE_TAG} area ${suffix}`]
  );
  const createCategory = (areaId, name) => insert(
    "INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', ?)",
    [`${FIXTURE_TAG} ${name}`, `${FIXTURE_TAG}-${name}`.toLowerCase(), areaId]
  );
  const createProduct = (areaId, categoryId, name, extra = {}) => insert(
    `INSERT INTO products (name, price, category_id, area_id, available, deleted, is_combo,
                           shop_id, group_id, available_from_time, available_until_time)
     VALUES (?, 50, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${FIXTURE_TAG} ${name}`, categoryId, areaId,
      extra.available ?? 1, extra.deleted ?? 0, extra.isCombo ?? 0,
      extra.shopId ?? null, extra.groupId ?? null, extra.from ?? null, extra.until ?? null,
    ]
  );
  const createUser = (name, areaId) => insert(
    'INSERT INTO users (name, phone, last_area_id) VALUES (?, ?, ?)',
    [`${FIXTURE_TAG} ${name}`, `8${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 900) + 100}`, areaId]
  );

  // `count` orders, each holding `items`, `daysAgo` days old.
  const orders = async (count, items, { areaId = area.id, status = 'Delivered', daysAgo = 3, customerId = buyer } = {}) => {
    for (let i = 0; i < count; i += 1) {
      orderSeq += 1;
      const orderId = await insert(
        `INSERT INTO orders (order_number, customer_id, customer_name, phone, address, subtotal,
                             delivery_charge, total, status, created_at, area_id)
         VALUES (?, ?, 'T', '7000000000', 'x', 100, 0, 100, ?, NOW() - INTERVAL ? DAY, ?)`,
        [`${FIXTURE_TAG}-S${orderSeq}`, customerId, status, daysAgo, areaId]
      );
      await pool.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total, area_id)
         VALUES ?`,
        [items.map((productId) => [orderId, productId, 'x', 1, 50, 50, areaId])]
      );
    }
  };

  const pairsOf = async (productId) => {
    const [rows] = await pool.query(
      'SELECT paired_product_id AS id, score, source FROM product_pairs WHERE area_id = ? AND product_id = ? ORDER BY score DESC',
      [area.id, productId]
    );
    return rows;
  };

  const suggest = (ids, { userId = buyer, areaId = area.id, query = '' } = {}) => request(app)
    .get(`/api/cart/suggestions?productIds=${ids.join(',')}${query}`)
    .set('Authorization', `Bearer ${tokenFor(userId)}`)
    .set('x-test-area', String(areaId));

  const idsOf = (res) => res.body.products.map((product) => product.id);

  beforeAll(async () => {
    await assertMysqlReady();

    area.id = await createArea('A');
    other.id = await createArea('B');

    for (const name of ['burgers', 'drinks', 'sides', 'curries', 'breads', 'grocery', 'desserts', 'blocked']) {
      cat[name] = await createCategory(area.id, name);
    }
    const otherCat = await createCategory(other.id, 'drinks-b');

    const closedShop = await insert('INSERT INTO shops (name, is_open, active, area_id) VALUES (?, 0, 1, ?)', [`${FIXTURE_TAG} closed`, area.id]);
    const openShop = await insert('INSERT INTO shops (name, is_open, active, area_id) VALUES (?, 1, 1, ?)', [`${FIXTURE_TAG} open`, area.id]);
    const offGroup = await insert('INSERT INTO product_groups (shop_id, name, active, area_id) VALUES (?, ?, 0, ?)', [openShop, `${FIXTURE_TAG} off`, area.id]);
    // A one-hour slot starting two hours from now (IST) — closed right now.
    const hour = (istHour(new Date()) + 2) % 24;
    const slot = (h) => `${String(h % 24).padStart(2, '0')}:00:00`;

    p.burger = await createProduct(area.id, cat.burgers, 'Aloo Tikki Burger');
    p.cheeseBurger = await createProduct(area.id, cat.burgers, 'Cheese Burger'); // never ordered
    p.coke = await createProduct(area.id, cat.drinks, 'Coke');
    p.pepsi = await createProduct(area.id, cat.drinks, 'Pepsi');
    p.sprite = await createProduct(area.id, cat.drinks, 'Sprite');
    p.fries = await createProduct(area.id, cat.sides, 'French Fries');
    p.paneer = await createProduct(area.id, cat.curries, 'Matar Paneer');
    p.kadaiPaneer = await createProduct(area.id, cat.curries, 'Kadai Paneer'); // never ordered
    p.roti = await createProduct(area.id, cat.breads, 'Tandoori Roti');
    p.naan = await createProduct(area.id, cat.breads, 'Butter Naan');
    p.water = await createProduct(area.id, cat.grocery, 'Water Bottle');
    p.milk = await createProduct(area.id, cat.grocery, 'Milk');
    p.cake = await createProduct(area.id, cat.desserts, 'Chocolate Cake');
    p.chefSpecial = await createProduct(area.id, cat.desserts, 'Chef Special'); // never ordered, no similar name
    // Bought with burgers a lot, but none of them can be sold right now.
    p.off = await createProduct(area.id, cat.blocked, 'Turned Off', { available: 0 });
    p.deleted = await createProduct(area.id, cat.blocked, 'Deleted', { deleted: 1 });
    p.closedShop = await createProduct(area.id, cat.blocked, 'Closed Shop Item', { shopId: closedShop });
    p.offGroup = await createProduct(area.id, cat.blocked, 'Hidden Group Item', { shopId: openShop, groupId: offGroup });
    p.notNow = await createProduct(area.id, cat.blocked, 'Later Today', { from: slot(hour), until: slot(hour + 1) });
    p.combo = await createProduct(area.id, cat.blocked, 'Combo', { isCombo: 1 });
    // Another area's products.
    p.otherBurger = await createProduct(other.id, otherCat, 'Other Burger');
    p.otherCola = await createProduct(other.id, otherCat, 'Other Cola');
    p.otherChips = await createProduct(other.id, otherCat, 'Other Chips');

    buyer = await createUser('buyer', area.id);
    loyalSpriteBuyer = await createUser('sprite fan', area.id);

    await orders(20, [p.burger, p.coke, p.water]);
    await orders(10, [p.burger, p.fries, p.water]);
    await orders(6, [p.burger, p.pepsi, p.water]);
    await orders(5, [p.burger, p.sprite, p.water]);
    // Habit change: roti was the side 5 months ago, naan is now.
    await orders(15, [p.paneer, p.roti, p.water], { daysAgo: 150 });
    await orders(12, [p.paneer, p.naan, p.water], { daysAgo: 4 });
    // Water is in almost every order: popular, not a pairing.
    await orders(40, [p.water]);
    await orders(10, [p.milk, p.water]);
    // Things that must not be learned.
    await orders(30, [p.burger, p.cake], { status: 'Cancelled' });
    await orders(30, [p.burger, p.cake], { status: 'Pending' });
    await orders(30, [p.paneer, p.cake], { daysAgo: 200 });
    await orders(25, [p.otherBurger, p.otherCola], { areaId: other.id });
    await orders(20, [p.otherChips], { areaId: other.id });
    for (const blocked of [p.off, p.deleted, p.closedShop, p.offGroup, p.notNow, p.combo]) {
      await orders(12, [p.burger, blocked]);
    }
    // This customer keeps buying Sprite.
    await orders(4, [p.sprite], { customerId: loyalSpriteBuyer });

    await buildAreaPairs(area.id);
    await buildAreaPairs(other.id);
  }, 120000);

  afterAll(async () => {
    await pool.query('DELETE FROM orders WHERE order_number LIKE ?', [`${FIXTURE_TAG}-S%`]);
    await pool.query('DELETE FROM products WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
    await pool.query('DELETE FROM product_groups WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
    await pool.query('DELETE FROM shops WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
    await pool.query('DELETE FROM categories WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
    await pool.query('DELETE FROM users WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
    await pool.query('DELETE FROM areas WHERE id IN (?, ?)', [area.id, other.id]); // pairs cascade
    await pool.end();
  });

  beforeEach(() => {
    microCache.clearAll();
    mockFeedback.rows = [];
  });

  describe('what the nightly build learns', () => {
    it('ranks the real burger habits and keeps plain popularity out', async () => {
      const burger = (await pairsOf(p.burger)).map((row) => row.id);
      expect(burger[0]).toBe(p.coke);
      expect(burger).toEqual(expect.arrayContaining([p.fries, p.pepsi]));
      expect(burger).not.toContain(p.water); // in every order anyway
    });

    it('ignores cancelled, pending and older-than-180-day orders', async () => {
      expect((await pairsOf(p.burger)).map((row) => row.id)).not.toContain(p.cake);
      expect((await pairsOf(p.paneer)).map((row) => row.id)).not.toContain(p.cake);
    });

    it('prefers the recent habit over an older, bigger one', async () => {
      const paneer = (await pairsOf(p.paneer)).map((row) => row.id);
      expect(paneer.indexOf(p.naan)).toBeLessThan(paneer.indexOf(p.roti));
      expect(paneer.indexOf(p.roti)).toBeGreaterThan(-1);
    });

    it('gives never-ordered products the matches of the closest name', async () => {
      const cheese = await pairsOf(p.cheeseBurger);
      expect(cheese[0]).toMatchObject({ id: p.coke, source: 'similar' });
      const kadai = (await pairsOf(p.kadaiPaneer)).map((row) => row.id);
      expect(kadai[0]).toBe(p.naan);
      expect(await pairsOf(p.chefSpecial)).toEqual([]);
    });

    it('keeps areas apart', async () => {
      const [leaks] = await pool.query(
        `SELECT COUNT(*) AS n FROM product_pairs pp
         JOIN products a ON a.id = pp.product_id
         JOIN products b ON b.id = pp.paired_product_id
         WHERE pp.area_id = ? AND (a.area_id <> pp.area_id OR b.area_id <> pp.area_id)`,
        [area.id]
      );
      expect(leaks[0].n).toBe(0);
      const [otherPairs] = await pool.query(
        'SELECT product_id, paired_product_id FROM product_pairs WHERE area_id = ?',
        [other.id]
      );
      expect(otherPairs).toEqual(expect.arrayContaining([
        expect.objectContaining({ product_id: p.otherBurger, paired_product_id: p.otherCola }),
      ]));
      // And that area's own cart row uses them.
      expect(idsOf(await suggest([p.otherBurger], { areaId: other.id }))[0]).toBe(p.otherCola);
    });

    it('learns category pairs too', async () => {
      const [rows] = await pool.query(
        'SELECT paired_category_id FROM category_pairs WHERE area_id = ? AND category_id = ?',
        [area.id, cat.curries]
      );
      expect(rows.map((row) => row.paired_category_id)).toContain(cat.breads);
    });

    it('gives the same result when built twice', async () => {
      const snapshot = async () => (await pool.query(
        'SELECT product_id, paired_product_id, score, source FROM product_pairs WHERE area_id = ? ORDER BY product_id, paired_product_id',
        [area.id]
      ))[0];
      const before = await snapshot();
      await buildAreaPairs(area.id);
      expect(await snapshot()).toEqual(before);
    });

    it('lets cart-row feedback reorder matches', async () => {
      // People skip Coke in the row and take Fries.
      mockFeedback.rows = [
        { _id: { productId: p.coke, type: 'suggestion_impression' }, count: 500 },
        { _id: { productId: p.fries, type: 'suggestion_impression' }, count: 500 },
        { _id: { productId: p.fries, type: 'suggestion_add' }, count: 150 },
      ];
      await buildAreaPairs(area.id);
      const burger = (await pairsOf(p.burger)).map((row) => row.id);
      expect(burger.indexOf(p.fries)).toBeLessThan(burger.indexOf(p.coke));

      mockFeedback.rows = [];
      await buildAreaPairs(area.id);
      expect((await pairsOf(p.burger))[0].id).toBe(p.coke);
    });
  });

  describe('what the cart row shows', () => {
    const BLOCKED = () => [p.off, p.deleted, p.closedShop, p.offGroup, p.notNow, p.combo];

    it('shows the best matches first, at most 5, never a blocked product', async () => {
      const res = await suggest([p.burger]);
      expect(res.status).toBe(200);
      const ids = idsOf(res);
      expect(ids[0]).toBe(p.coke);
      expect(ids).toContain(p.fries);
      expect(ids.length).toBeLessThanOrEqual(5);
      for (const blocked of BLOCKED()) expect(ids).not.toContain(blocked);
      expect(ids).not.toContain(p.burger);
    });

    it('shows at most 2 from one category', async () => {
      const res = await suggest([p.burger]);
      const drinks = res.body.products.filter((product) => product.categoryId === cat.drinks);
      expect(drinks).toHaveLength(2);
    });

    it('combines two different cart items', async () => {
      const ids = idsOf(await suggest([p.burger, p.paneer]));
      expect(ids).toContain(p.coke);
      expect(ids).toContain(p.naan);
    });

    it('never repeats what is already in the cart', async () => {
      const ids = idsOf(await suggest([p.burger, p.coke]));
      expect(ids).not.toContain(p.coke);
      expect(ids[0]).not.toBe(p.burger);
    });

    it('works for a brand-new product through its borrowed matches', async () => {
      expect(idsOf(await suggest([p.cheeseBurger]))[0]).toBe(p.coke);
    });

    it("pushes up what this customer usually buys", async () => {
      const stranger = idsOf(await suggest([p.burger], { userId: buyer }));
      microCache.clearAll();
      const fan = idsOf(await suggest([p.burger], { userId: loyalSpriteBuyer }));
      const rank = (ids) => (ids.includes(p.sprite) ? ids.indexOf(p.sprite) : 99);
      expect(rank(fan)).toBeLessThan(rank(stranger));
    });

    it("never shows another area's products, even for another area's cart ids", async () => {
      const ids = idsOf(await suggest([p.otherBurger]));
      expect(ids).not.toContain(p.otherCola);
      expect(ids).not.toContain(p.otherBurger);
      const [rows] = ids.length
        ? await pool.query('SELECT DISTINCT area_id FROM products WHERE id IN (?)', [ids])
        : [[]];
      for (const row of rows) expect(row.area_id).toBe(area.id);
    });

    it('falls back to best sellers for a product with nothing learned', async () => {
      const ids = idsOf(await suggest([p.chefSpecial]));
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain(p.water);
    });

    it('answers an empty list for an area with no orders at all', async () => {
      const emptyArea = await createArea('E');
      try {
        await buildAreaPairs(emptyArea);
        const res = await suggest([p.burger], { areaId: emptyArea });
        expect(res.status).toBe(200);
        expect(res.body.products).toEqual([]);
      } finally {
        await pool.query('DELETE FROM areas WHERE id = ?', [emptyArea]);
      }
    });

    it('survives garbage input', async () => {
      const cases = [
        'abc,-1,0,1.5',
        encodeURIComponent("1' OR '1'='1"),
        encodeURIComponent('1);DROP TABLE products;--'),
        Array.from({ length: 500 }, (_, i) => i + 1).join(','),
        '',
      ];
      for (const ids of cases) {
        const res = await suggest([ids]);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
      }
      const [[stillThere]] = await pool.query('SELECT COUNT(*) AS n FROM products WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
      expect(stillThere.n).toBeGreaterThan(0);
    });

    it('caps the limit', async () => {
      expect(idsOf(await suggest([p.burger], { query: '&limit=1000' })).length).toBeLessThanOrEqual(10);
      microCache.clearAll();
      expect(idsOf(await suggest([p.burger], { query: '&limit=2' }))).toHaveLength(2);
      microCache.clearAll();
      expect(idsOf(await suggest([p.burger], { query: '&limit=-4' })).length).toBeLessThanOrEqual(5);
    });

    it('shows a new build straight away, without waiting for the cache', async () => {
      const first = idsOf(await suggest([p.burger]));
      expect(first[0]).toBe(p.coke);
      mockFeedback.rows = [
        { _id: { productId: p.coke, type: 'suggestion_impression' }, count: 500 },
        { _id: { productId: p.fries, type: 'suggestion_impression' }, count: 500 },
        { _id: { productId: p.fries, type: 'suggestion_add' }, count: 150 },
      ];
      await buildAreaPairs(area.id);
      expect(idsOf(await suggest([p.burger]))[0]).toBe(p.fries);
      mockFeedback.rows = [];
      await buildAreaPairs(area.id);
    });

    it('stays correct under 150 requests at once', async () => {
      // Straight to the controller: the route's own rate limit (100 GETs a
      // minute per IP) is not what this measures.
      const burstApp = express();
      burstApp.get('/s', (req, res, next) => {
        req.user = { id: buyer };
        req.areaId = area.id;
        next();
      }, getCartSuggestions);
      const results = await Promise.all(Array.from({ length: 150 }, () => request(burstApp)
        .get(`/s?productIds=${p.burger},${p.paneer}`)));
      const expected = JSON.stringify(idsOf(results[0]));
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(JSON.stringify(idsOf(res))).toBe(expected);
      }
    });
  });
});
