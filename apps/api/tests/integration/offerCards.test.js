// Home offer cards and deal price admin, against a REAL MySQL: the admin
// creates a deal price offer, its deal items and a card, puts the card on an
// 'offer_cards' Home row, and the public dashboard + Deal page show it. The
// catalog query (ROW_NUMBER per price tier, JSON style column) only proves
// itself on a real server.
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
const dashboardRoutes = require('../../src/routes/dashboardRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
// A pin-less, signed-out read resolves to no area (resolveCustomerArea), and
// this database has no zones to drop a pin in — so stand in for a signed-in
// customer whose live area is Area 1, the one branch that needs neither.
app.use('/api/dashboard', (req, _res, next) => { req.user = { id: 1, liveAreaId: 1 }; next(); }, dashboardRoutes);

// Same complete area_admin session orderConcurrency.test.js uses.
const adminToken = jwt.sign(
  { id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 1 },
  process.env.JWT_SECRET || 'secret'
);
const admin = (method, url) => request(app)[method](`/api/admin${url}`).set('Authorization', `Bearer ${adminToken}`);

describeWithMysql('offer cards + deal admin (real MySQL)', () => {
  const ids = {};
  const slug = `${FIXTURE_TAG.toLowerCase()}-offers`;

  beforeAll(async () => {
    await assertMysqlReady();
    const [cat] = await pool.query(
      "INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', 1)",
      [`${FIXTURE_TAG} Cards Cat`, `${FIXTURE_TAG.toLowerCase()}-cards-cat`]
    );
    ids.category = cat.insertId;
    const product = async (name, price) => {
      const [r] = await pool.query(
        `INSERT INTO products (name, price, category_id, area_id, available, deleted, is_combo)
         VALUES (?, ?, ?, 1, 1, 0, 0)`,
        [`${FIXTURE_TAG} ${name}`, price, ids.category]
      );
      return r.insertId;
    };
    ids.potato = await product('Potato', 30);
    ids.chips = await product('Chips', 20);
    ids.onion = await product('Onion', 40);
    const [v1] = await pool.query(
      "INSERT INTO product_variants (product_id, label, price, available, is_default, display_order) VALUES (?, '1 kg', 40, 1, 1, 0)",
      [ids.onion]
    );
    ids.onion1kg = v1.insertId;
    const [v2] = await pool.query(
      "INSERT INTO product_variants (product_id, label, price, available, is_default, display_order) VALUES (?, '2 kg', 75, 1, 0, 1)",
      [ids.onion]
    );
    ids.onion2kg = v2.insertId;
  });

  afterAll(async () => {
    if (ids.section) await pool.query('DELETE FROM dashboard_sections WHERE id = ?', [ids.section]);
    if (ids.commonSection) await pool.query('DELETE FROM dashboard_sections WHERE id = ?', [ids.commonSection]);
    if (ids.daySection) await pool.query('DELETE FROM dashboard_sections WHERE id = ?', [ids.daySection]);
    if (ids.card) await pool.query('DELETE FROM offer_cards WHERE id = ?', [ids.card]);
    if (ids.dayCard) await pool.query('DELETE FROM offer_cards WHERE id = ?', [ids.dayCard]);
    if (ids.deal) await pool.query('DELETE FROM coupons WHERE id = ?', [ids.deal]);
    await pool.query('DELETE FROM product_variants WHERE product_id IN (?)', [[ids.potato, ids.chips, ids.onion]]);
    await pool.query('DELETE FROM products WHERE id IN (?)', [[ids.potato, ids.chips, ids.onion]]);
    await pool.query('DELETE FROM categories WHERE id = ?', [ids.category]);
    await pool.query('DELETE FROM dashboard_sections WHERE slug = ?', [slug]);
    await pool.end();
  });

  it('creates a deal price offer that is always automatic and code-less', async () => {
    const res = await admin('post', '/coupons').send({
      title: `${FIXTURE_TAG} ₹9ryday`,
      discount_type: 'deal_price',
      min_order_amount: 299,
      deal_max_items: 1,
      code: 'IGNORED',
      requires_code: true,
    });
    expect(res.statusCode).toBe(201);
    ids.deal = res.body.id;
    const [[row]] = await pool.query('SELECT * FROM coupons WHERE id = ?', [ids.deal]);
    expect(row).toMatchObject({
      discount_type: 'deal_price', code: null, auto_apply: 1, requires_code: 0,
      deal_max_items: 1, per_user_usage_limit: null, area_id: 1,
    });
  });

  it('adds deal items, checking options and prices', async () => {
    let res = await admin('post', `/coupons/${ids.deal}/deal-items`).send({ product_id: ids.potato, deal_price: 9 });
    expect(res.statusCode).toBe(201);
    ids.potatoItem = res.body.id;

    res = await admin('post', `/coupons/${ids.deal}/deal-items`).send({ product_id: ids.chips, deal_price: 9 });
    expect(res.statusCode).toBe(201);

    res = await admin('post', `/coupons/${ids.deal}/deal-items`).send({ product_id: ids.potato, deal_price: 30 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/below the normal price/);

    res = await admin('post', `/coupons/${ids.deal}/deal-items`).send({ product_id: ids.onion, deal_price: 29 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/options/);

    res = await admin('post', `/coupons/${ids.deal}/deal-items`).send({ product_id: ids.onion, variant_id: ids.onion1kg, deal_price: 29 });
    expect(res.statusCode).toBe(201);

    // Adding the same product again only changes its price.
    res = await admin('post', `/coupons/${ids.deal}/deal-items`).send({ product_id: ids.potato, deal_price: 5 });
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(ids.potatoItem);

    res = await admin('get', `/coupons/${ids.deal}/deal-items`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((i) => [i.productId, i.variantLabel, i.dealPrice, i.regularPrice])).toEqual([
      [ids.potato, null, 5, 30],
      [ids.chips, null, 9, 20],
      [ids.onion, '1 kg', 29, 40],
    ]);
  });

  it('refuses deal items on a normal coupon', async () => {
    const [r] = await pool.query(
      "INSERT INTO coupons (code, title, discount_type, discount_value, area_id) VALUES (?, ?, 'flat', 10, 1)",
      [`${FIXTURE_TAG}FLAT`, `${FIXTURE_TAG} flat`]
    );
    const res = await admin('get', `/coupons/${r.insertId}/deal-items`);
    expect(res.statusCode).toBe(400);
    await pool.query('DELETE FROM coupons WHERE id = ?', [r.insertId]);
  });

  it('creates a card, validating its style', async () => {
    let res = await admin('post', '/offer-cards').send({
      title: 'Items from ₹9', deal_coupon_id: ids.deal, style: { bgColor: 'purple' },
    });
    expect(res.statusCode).toBe(400);

    res = await admin('post', '/offer-cards').send({ title: 'No deal' });
    expect(res.statusCode).toBe(400);

    res = await admin('post', '/offer-cards').send({
      title: 'Items from ₹9',
      subtitle: 'Get any 1 item when you shop for ₹299',
      deal_coupon_id: ids.deal,
      style: { bgColor: '#FFF000', rowsPerTab: 1, buttonText: 'Add' },
    });
    expect(res.statusCode).toBe(201);
    ids.card = res.body.id;

    res = await admin('get', '/offer-cards');
    const card = res.body.data.find((c) => c.id === ids.card);
    expect(card).toMatchObject({ design: 'deal_tabs', dealTitle: `${FIXTURE_TAG} ₹9ryday` });
    expect(card.style).toMatchObject({ bgColor: '#FFF000', rowsPerTab: 1, buttonText: 'Add', footerText: 'View items at all prices' });
  });

  it('stores a card schedule as a moment in time: a UTC time as is, a bare time as IST', async () => {
    // The Home query compares these with NOW(), so a bare "12:30" must not be
    // stored as 12:30 in the database's own zone (UTC on the live server).
    const istWallClock = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 16);
    const hourAgo = Date.now() - 3600000;
    const twoDaysOn = hourAgo + 2 * 86400000;
    let res = await admin('post', '/offer-cards').send({
      title: 'Scheduled',
      deal_coupon_id: ids.deal,
      starts_at: istWallClock(hourAgo),
      ends_at: new Date(twoDaysOn).toISOString(),
    });
    expect(res.statusCode).toBe(201);
    const id = res.body.id;
    try {
      res = await admin('get', `/offer-cards/${id}`);
      expect(Math.abs(new Date(res.body.data.starts_at).getTime() - hourAgo)).toBeLessThan(60000);
      expect(Math.abs(new Date(res.body.data.ends_at).getTime() - twoDaysOn)).toBeLessThan(1000);
      const [[row]] = await pool.query(
        'SELECT (starts_at <= NOW() AND ends_at >= NOW()) AS live FROM offer_cards WHERE id = ?',
        [id]
      );
      expect(Number(row.live)).toBe(1);
    } finally {
      await pool.query('DELETE FROM offer_cards WHERE id = ?', [id]);
    }
  });

  it('shows the card on an offer_cards Home row with one product per tier', async () => {
    let res = await admin('post', '/dashboard-sections').send({
      title: 'Offers', slug, section_type: 'offer_cards', store_type: 'packed', display_order: 0,
    });
    expect(res.statusCode).toBe(201);
    ids.section = res.body.id;

    res = await admin('post', `/dashboard-sections/${ids.section}/items`).send({ item_type: 'product', item_id: ids.potato });
    expect(res.statusCode).toBe(400);

    res = await admin('post', `/dashboard-sections/${ids.section}/items`).send({ item_type: 'offer_card', item_id: ids.card });
    expect(res.statusCode).toBe(201);

    res = await request(app).get('/api/dashboard?storeType=packed');
    expect(res.statusCode).toBe(200);
    const section = res.body.data.sections.find((s) => s.id === ids.section);
    expect(section).toBeDefined();
    expect(section.sectionType).toBe('offer_cards');
    const [card] = section.items;
    expect(card).toMatchObject({ id: ids.card, design: 'deal_tabs', title: 'Items from ₹9', dealId: ids.deal });
    expect(card.style.bgColor).toBe('#FFF000');
    expect(card.deal).toMatchObject({ id: ids.deal, minOrder: 299, maxItems: 1 });
    // One tab per deal price, rowsPerTab (1) products in each.
    expect(card.deal.tiers.map((t) => [t.price, t.items.map((i) => i.id)])).toEqual([
      [5, [ids.potato]],
      [9, [ids.chips]],
      [29, [ids.onion]],
    ]);
    expect(card.deal.tiers[2].items[0]).toMatchObject({ dealVariantId: ids.onion1kg, dealVariantLabel: '1 kg', regularPrice: 40, dealPrice: 29 });
  });

  it('a mode section stays in its mode; a Common section shows in every mode', async () => {
    let res = await request(app).get('/api/dashboard?storeType=fast_food');
    expect(res.body.data.sections.find((s) => s.id === ids.section)).toBeUndefined();

    res = await admin('post', '/dashboard-sections').send({
      title: '', slug: `${slug}-common`, section_type: 'offer_cards', store_type: 'common', display_order: 0,
    });
    expect(res.statusCode).toBe(201);
    ids.commonSection = res.body.id;
    res = await admin('post', `/dashboard-sections/${ids.commonSection}/items`).send({ item_type: 'offer_card', item_id: ids.card });
    expect(res.statusCode).toBe(201);

    for (const mode of ['packed', 'fast_food']) {
      res = await request(app).get(`/api/dashboard?storeType=${mode}`);
      const section = res.body.data.sections.find((s) => s.id === ids.commonSection);
      expect(section).toMatchObject({ storeType: 'common', sectionType: 'offer_cards' });
      expect(section.items.map((c) => c.id)).toEqual([ids.card]);
    }

    // Listed under its own Common tab in admin, not under a mode.
    res = await admin('get', '/dashboard-sections?store_type=common');
    expect(res.body.data.map((s) => s.id)).toEqual([ids.commonSection]);
    res = await admin('get', '/dashboard-sections?store_type=fast_food');
    expect(res.body.data.some((s) => s.id === ids.commonSection)).toBe(false);
  });

  it('the Deal page lists every product with the card look', async () => {
    const res = await request(app).get(`/api/dashboard/deals/${ids.deal}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.deal.tiers.flatMap((t) => t.items.map((i) => i.id))).toEqual([ids.potato, ids.chips, ids.onion]);
    expect(res.body.data.card).toMatchObject({ id: ids.card, subtitle: 'Get any 1 item when you shop for ₹299' });

    const missing = await request(app).get('/api/dashboard/deals/999999999');
    expect(missing.statusCode).toBe(404);
  });

  it('a "Deals of the day" card (template 2) lists its picked products at their own price', async () => {
    // MRPs, set before anything below busts the dashboard cache.
    await pool.query('UPDATE products SET original_price = 45 WHERE id = ?', [ids.potato]);
    await pool.query('UPDATE product_variants SET original_price = 90 WHERE id = ?', [ids.onion2kg]);

    let res = await admin('post', '/offer-cards').send({
      design: 'deals_of_day', title: 'Deals of the day', deal_coupon_id: ids.deal, style: { rowsPerTab: 1 },
    });
    expect(res.statusCode).toBe(201);
    ids.dayCard = res.body.id;
    res = await admin('get', `/offer-cards/${ids.dayCard}`);
    // No deal on template 2, and its own default look.
    expect(res.body.data).toMatchObject({ design: 'deals_of_day', deal_coupon_id: null });
    expect(res.body.data.style).toMatchObject({ buttonText: 'ADD', footerText: 'See all', rowsPerTab: 1 });

    // The template stays; deal cards have no product list.
    res = await admin('patch', `/offer-cards/${ids.dayCard}`).send({ design: 'deal_tabs' });
    expect(res.statusCode).toBe(400);
    res = await admin('get', `/offer-cards/${ids.card}/products`);
    expect(res.statusCode).toBe(400);

    res = await admin('post', `/offer-cards/${ids.dayCard}/products`).send({ product_id: ids.potato });
    expect(res.statusCode).toBe(201);
    const potatoRow = res.body.id;
    res = await admin('post', `/offer-cards/${ids.dayCard}/products`).send({ product_id: ids.potato });
    expect(res.body.id).toBe(potatoRow); // same product again: still one row
    res = await admin('post', `/offer-cards/${ids.dayCard}/products`).send({ product_id: ids.onion });
    expect(res.statusCode).toBe(400); // has options: must name one
    res = await admin('post', `/offer-cards/${ids.dayCard}/products`).send({ product_id: ids.onion, variant_id: ids.onion2kg });
    expect(res.statusCode).toBe(201);
    const onionRow = res.body.id;
    res = await admin('patch', `/offer-cards/${ids.dayCard}/products/reorder`).send({ itemIds: [onionRow, potatoRow] });
    expect(res.statusCode).toBe(200);

    res = await admin('get', `/offer-cards/${ids.dayCard}/products`);
    expect(res.body.data.map((r) => [r.productId, r.variantLabel, r.price, r.mrp])).toEqual([
      [ids.onion, '2 kg', 75, 90],
      [ids.potato, null, 30, 45],
    ]);

    res = await admin('post', '/dashboard-sections').send({
      title: '', slug: `${slug}-day`, section_type: 'offer_cards', store_type: 'packed', display_order: 0,
    });
    ids.daySection = res.body.id;
    res = await admin('post', `/dashboard-sections/${ids.daySection}/items`).send({ item_type: 'offer_card', item_id: ids.dayCard });
    expect(res.statusCode).toBe(201);

    // Home shows rowsPerTab (1) of them...
    res = await request(app).get('/api/dashboard?storeType=packed');
    const [card] = res.body.data.sections.find((s) => s.id === ids.daySection).items;
    expect(card).toMatchObject({ id: ids.dayCard, design: 'deals_of_day', deal: null });
    expect(card.products.map((p) => p.id)).toEqual([ids.onion]);
    expect(card.products[0]).toMatchObject({ offerVariantId: ids.onion2kg, offerVariantLabel: '2 kg', offerPrice: 75, offerMrp: 90 });

    // ...and its See all page every one.
    res = await request(app).get(`/api/dashboard/offer-cards/${ids.dayCard}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.card).toMatchObject({ id: ids.dayCard, title: 'Deals of the day' });
    expect(res.body.data.products.map((p) => [p.id, p.offerPrice, p.offerMrp])).toEqual([
      [ids.onion, 75, 90],
      [ids.potato, 30, 45],
    ]);
    res = await request(app).get(`/api/dashboard/offer-cards/${ids.card}`);
    expect(res.statusCode).toBe(404); // a deal card has the Deal page instead

    res = await admin('delete', `/offer-cards/${ids.dayCard}/products/${onionRow}`);
    expect(res.statusCode).toBe(200);
    res = await admin('get', `/offer-cards/${ids.dayCard}/products`);
    expect(res.body.data.map((r) => r.id)).toEqual([potatoRow]);
  });

  it('a switched-off deal hides its card; deleting the card empties the row', async () => {
    await admin('patch', `/coupons/${ids.deal}`).send({ active: false });
    let res = await request(app).get('/api/dashboard?storeType=packed');
    expect(res.body.data.sections.find((s) => s.id === ids.section)).toBeUndefined();
    await admin('patch', `/coupons/${ids.deal}`).send({ active: true });

    res = await admin('delete', `/offer-cards/${ids.card}`);
    expect(res.statusCode).toBe(200);
    const [[item]] = await pool.query(
      "SELECT deleted_at FROM dashboard_section_items WHERE section_id = ? AND item_type = 'offer_card'",
      [ids.section]
    );
    expect(item.deleted_at).not.toBeNull();
    res = await request(app).get('/api/dashboard?storeType=packed');
    expect(res.body.data.sections.find((s) => s.id === ids.section)).toBeUndefined();
  });
});
