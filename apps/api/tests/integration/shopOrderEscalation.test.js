const { describeWithMysql, assertMysqlReady, pool, FIXTURE_TAG, createUser, createOrderRow, cleanupFixtures } = require('../helpers/realMysql');
jest.mock('../../src/realtime/socket', () => ({ emitToAdmins: jest.fn(), emitToPlatformAdmins: jest.fn() }));
jest.mock('../../src/utils/expoPush', () => ({ sendPushToMany: jest.fn().mockResolvedValue({}) }));
const { escalatePendingShopOrder } = require('../../src/services/shopOrderEscalation');
const { alertAdminsForPendingShopOrders } = require('../../src/realtime/shopAlertSweeper');
const adminInbox = require('../../src/utils/adminNotifications');

describeWithMysql('shop response escalation (real MySQL)', () => {
  let userId;
  let shopId;
  let productId;
  let categoryId;
  beforeAll(async () => {
    await assertMysqlReady();
    userId = await createUser('Shop Escalation');
    const [shop] = await pool.query('INSERT INTO shops (name, area_id, active, is_open) VALUES (?, 1, 1, 1)', [`${FIXTURE_TAG} Escalation Shop`]);
    shopId = shop.insertId;
    const [category] = await pool.query("INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', 1)", [`${FIXTURE_TAG} Escalation`, `${FIXTURE_TAG.toLowerCase()}-escalation`]);
    categoryId = category.insertId;
    const [product] = await pool.query('INSERT INTO products (name, price, shop_id, category_id, area_id) VALUES (?, 100, ?, ?, 1)', [`${FIXTURE_TAG} Escalation Product`, shopId, categoryId]);
    productId = product.insertId;
  });
  afterAll(async () => {
    await pool.query('DELETE FROM admin_notifications WHERE type = ? AND title LIKE ?', ['shop_not_responding', `%${FIXTURE_TAG}%`]);
    await cleanupFixtures();
    if (productId) await pool.query('DELETE FROM products WHERE id = ?', [productId]);
    if (categoryId) await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
    if (shopId) await pool.query('DELETE FROM shops WHERE id = ?', [shopId]);
    await pool.end();
  });
  const newOrder = async ({ minutes = 4, status = 'Accepted', confirmed = false, rejected = false, acked = false } = {}) => {
    const id = await createOrderRow(userId, { status });
    await pool.query('UPDATE orders SET accepted_at = NOW() - INTERVAL ? MINUTE WHERE id = ?', [minutes, id]);
    // Two lines for the same shop must produce just one alert.
    for (let i = 0; i < 2; i++) {
      await pool.query(`INSERT INTO order_items (order_id, area_id, shop_id, product_id, item_type, product_name, quantity,
        unit_price, line_total, shop_requested_at, shop_confirmed_at, shop_rejected_at, shop_alert_acked_at)
        VALUES (?, 1, ?, ?, 'product', ?, 1, 100, 100, NOW() - INTERVAL ? MINUTE,
          IF(?, NOW(), NULL), IF(?, NOW(), NULL), IF(?, NOW(), NULL))`,
      [id, shopId, productId, `${FIXTURE_TAG} Item ${i}`, minutes, confirmed, rejected, acked]);
    }
    return id;
  };
  const notifications = async id => (await pool.query(
    'SELECT * FROM admin_notifications WHERE type = ? AND related_url = ?', ['shop_not_responding', `/orders?id=${id}`]
  ))[0];

  it('serializes simultaneous sweeps and keeps the order pending at its shop', async () => {
    const id = await newOrder({ acked: true });
    await Promise.all([
      escalatePendingShopOrder(id, shopId, 'Shop'),
      escalatePendingShopOrder(id, shopId, 'Shop'),
    ]);
    expect(await notifications(id)).toHaveLength(1);
    const [items] = await pool.query('SELECT shop_admin_alerted_at, shop_confirmed_at, shop_rejected_at FROM order_items WHERE order_id = ?', [id]);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.shop_admin_alerted_at).not.toBeNull();
      expect(item.shop_confirmed_at).toBeNull();
      expect(item.shop_rejected_at).toBeNull();
    }
  });

  it('does not repeat an escalation after the inbox row is dismissed', async () => {
    const id = await newOrder();
    await escalatePendingShopOrder(id, shopId, 'Shop');
    await pool.query('DELETE FROM admin_notifications WHERE type = ? AND related_url = ?', ['shop_not_responding', `/orders?id=${id}`]);
    expect(await escalatePendingShopOrder(id, shopId, 'Shop')).toBeNull();
    expect(await notifications(id)).toHaveLength(0);
  });

  it.each([
    ['before 3 minutes', { minutes: 2 }],
    ['after timeout', { minutes: 31 }],
    ['confirmed', { confirmed: true }],
    ['rejected', { rejected: true }],
    ['cancelled', { status: 'Cancelled' }],
    ['delivered', { status: 'Delivered' }],
    ['not yet accepted', { status: 'Pending' }],
  ])('does not notify for a shop %s', async (_label, options) => {
    const id = await newOrder(options);
    expect(await escalatePendingShopOrder(id, shopId, 'Shop')).toBeNull();
    expect(await notifications(id)).toHaveLength(0);
  });

  it('rechecks a fresh resend after a candidate was selected', async () => {
    const id = await newOrder();
    await pool.query('UPDATE order_items SET shop_requested_at = NOW() WHERE order_id = ?', [id]);
    expect(await escalatePendingShopOrder(id, shopId, 'Shop')).toBeNull();
  });

  it('rolls back both item markers when the inbox write fails and successfully retries', async () => {
    const id = await newOrder();
    const insert = jest.spyOn(adminInbox, 'insertAdminNotification').mockRejectedValueOnce(new Error('inbox unavailable'));
    try {
      await expect(escalatePendingShopOrder(id, shopId, 'Shop')).rejects.toThrow('inbox unavailable');
      const [items] = await pool.query('SELECT shop_admin_alerted_at FROM order_items WHERE order_id = ?', [id]);
      expect(items.every(item => item.shop_admin_alerted_at === null)).toBe(true);
      expect(await notifications(id)).toHaveLength(0);
      await escalatePendingShopOrder(id, shopId, 'Shop');
      expect(await notifications(id)).toHaveLength(1);
    } finally {
      insert.mockRestore();
    }
  });

  it('the candidate scan sends a single area-scoped escalation for a due shop', async () => {
    const id = await newOrder();
    await alertAdminsForPendingShopOrders();
    const rows = await notifications(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].area_id).toBe(1);
  });
});
