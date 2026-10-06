// Real row locks and report SQL: mocked arithmetic cannot catch a lost shop
// decision or an aggregate that counts rejected sales.
const { describeWithMysql, assertMysqlReady, pool, FIXTURE_TAG, createUser, createOrderRow, cleanupFixtures } = require('../helpers/realMysql');

jest.mock('../../src/services/riderAssignment', () => ({ maybeStartRiderAssignment: jest.fn().mockResolvedValue({ started: false }) }));
jest.mock('../../src/utils/shops', () => ({ ...jest.requireActual('../../src/utils/shops'), maybeAutoCancelOrderWhenAllShopsRejected: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/realtime/socket', () => ({ emitToAdmins: jest.fn(), emitToCustomer: jest.fn() }));
jest.mock('../../src/realtime/orderEvents', () => ({ emitOrderStatusUpdated: jest.fn(), emitNotificationCreated: jest.fn() }));
jest.mock('../../src/utils/notificationService', () => ({ createOrderNotification: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/utils/adminNotifications', () => ({ TYPES: { SHOP_REJECTED: 'shop_rejected' }, createAdminNotification: jest.fn().mockResolvedValue(null) }));
const { confirmShopOrder, rejectShopOrder, resendShopOrder } = require('../../src/services/shopOrderActions');
const reports = require('../../src/controllers/adminController');
const { saveOrderBilling } = require('../../src/services/orderBilling');

const report = async (name) => {
  let body;
  const res = { status: jest.fn().mockReturnThis(), json: value => { body = value; } };
  await reports[name]({ areaId: 1, admin: { adminRole: 'area_admin', areaId: 1 }, query: { period: 'all', limit: 100 } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  return body;
};

describeWithMysql('shop billing and reports (real MySQL)', () => {
  let userId;
  const shops = [];
  const products = [];
  let categoryId;
  beforeAll(async () => {
    await assertMysqlReady();
    userId = await createUser('Billing Customer');
    const [category] = await pool.query("INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', 1)", [`${FIXTURE_TAG} Billing`, `${FIXTURE_TAG.toLowerCase()}-billing`]);
    categoryId = category.insertId;
    for (const suffix of ['A', 'B']) {
      const [result] = await pool.query('INSERT INTO shops (name, area_id, active, is_open) VALUES (?, 1, 1, 1)', [`${FIXTURE_TAG} Billing ${suffix}`]);
      shops.push(result.insertId);
      const [product] = await pool.query('INSERT INTO products (name, price, shop_id, category_id, area_id) VALUES (?, 100, ?, ?, 1)', [`${FIXTURE_TAG} Product ${suffix}`, result.insertId, categoryId]);
      products.push(product.insertId);
    }
  });
  afterAll(async () => {
    await cleanupFixtures();
    for (const id of products) await pool.query('DELETE FROM products WHERE id = ?', [id]);
    if (categoryId) await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
    for (const id of shops) await pool.query('DELETE FROM shops WHERE id = ?', [id]);
    await pool.end();
  });
  const newOrder = async () => {
    const id = await createOrderRow(userId, { status: 'Accepted', paymentMethod: 'Cash' });
    await pool.query('UPDATE orders SET subtotal = 300, delivery_charge = 20, total = 320, accepted_at = NOW() - INTERVAL 1 DAY WHERE id = ?', [id]);
    for (let i = 0; i < 2; i++) {
      await pool.query(`INSERT INTO order_items (order_id, area_id, shop_id, product_id, item_type, product_name,
        quantity, unit_price, line_total, shop_unit_price, shop_line_total)
        VALUES (?, 1, ?, ?, 'product', ?, 1, ?, ?, ?, ?)`,
      [id, shops[i], products[i], `${FIXTURE_TAG} Item ${i}`, (i + 1) * 100, (i + 1) * 100, (i + 1) * 70, (i + 1) * 70]);
    }
    return id;
  };
  const bill = async id => (await pool.query('SELECT * FROM orders WHERE id = ?', [id]))[0][0];

  it('reject -> resend -> accept -> reject updates cash, sales, products, payouts and profit consistently', async () => {
    const base = await report('getProfitSummary');
    const salesBase = await report('getSalesReport');
    const id = await newOrder();
    expect((await confirmShopOrder(shops[0], id)).ok).toBe(true);
    expect((await confirmShopOrder(shops[1], id)).ok).toBe(true);
    expect(Number((await bill(id)).total)).toBe(320);
    await rejectShopOrder(shops[1], id);
    expect(Number((await bill(id)).total)).toBe(120);
    await rejectShopOrder(shops[1], id);
    expect(Number((await bill(id)).total)).toBe(120);
    await resendShopOrder(shops[1], id);
    expect(Number((await bill(id)).total)).toBe(120);
    const [[pending]] = await pool.query('SELECT shop_billable, shop_confirmed_at, shop_ready_at FROM order_items WHERE order_id = ? AND shop_id = ?', [id, shops[1]]);
    expect(pending).toMatchObject({ shop_billable: 0, shop_confirmed_at: null, shop_ready_at: null });
    await confirmShopOrder(shops[1], id);
    expect(Number((await bill(id)).total)).toBe(320);
    await rejectShopOrder(shops[1], id);
    await pool.query("UPDATE orders SET status = 'Delivered', payment_status = 'Paid', delivered_at = NOW() WHERE id = ?", [id]);
    const result = await report('getProfitSummary');
    expect(result.totals.customerPaid - base.totals.customerPaid).toBe(120);
    expect(result.totals.appSales - base.totals.appSales).toBe(100);
    expect(result.totals.shopCost - base.totals.shopCost).toBe(70);
    expect(result.totals.netProfit - base.totals.netProfit).toBe(50);
    expect(result.paymentSplit.cash.amount - base.paymentSplit.cash.amount).toBe(120);
    const sales = await report('getSalesReport');
    expect(Number(sales.total_revenue) - Number(salesBase.total_revenue)).toBe(120);
    expect(result.shops.find(s => s.shopId === shops[0])).toMatchObject({ appSales: 100, shopCost: 70, itemsSold: 1 });
    expect(result.shops.find(s => s.shopId === shops[1])).toBeUndefined();
    const shopSales = await report('getShopsReport');
    expect(Number(shopSales.data.find(s => s.shop_id === shops[0]).total_amount)).toBe(100);
    expect(shopSales.data.find(s => s.shop_id === shops[1])).toBeUndefined();
    const top = await report('getTopProductsReport');
    expect(top.data.find(p => p.product_name === `${FIXTURE_TAG} Item 1`)).toBeUndefined();
    const detail = await report('getProfitOrders');
    expect(detail.data.find(o => o.id === id)).toMatchObject({ appItemsTotal: 100, customerPaid: 120, shopCost: 70, netProfit: 50 });
  });

  it('simultaneous shop rejections cannot lose a deduction and late acceptance requires resend', async () => {
    const id = await newOrder();
    await Promise.all(shops.map(shopId => rejectShopOrder(shopId, id)));
    expect(Number((await bill(id)).total)).toBe(0);
    expect(Number((await bill(id)).subtotal)).toBe(0);
    expect((await confirmShopOrder(shops[1], id)).status).toBe(409);
    expect(Number((await bill(id)).total)).toBe(0);
  });

  it('a stale timeout cannot reject confirmed goods or a freshly resent shop', async () => {
    const id = await newOrder();
    await confirmShopOrder(shops[0], id);
    expect((await rejectShopOrder(shops[0], id, { source: 'timeout' })).status).toBe(409);
    expect(Number((await bill(id)).total)).toBe(320);
    await rejectShopOrder(shops[1], id);
    await resendShopOrder(shops[1], id);
    expect((await rejectShopOrder(shops[1], id, { source: 'timeout' })).status).toBe(409);
    expect(Number((await bill(id)).total)).toBe(120);
    const [[pending]] = await pool.query('SELECT shop_requested_at, shop_rejected_at FROM order_items WHERE order_id = ? AND shop_id = ?', [id, shops[1]]);
    expect(pending.shop_requested_at).not.toBeNull();
    expect(pending.shop_rejected_at).toBeNull();
  });

  it('a substituted rejected item stays excluded until the shop accepts it again', async () => {
    const id = await newOrder();
    await rejectShopOrder(shops[1], id);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
      await connection.query('UPDATE order_items SET unit_price = 50, line_total = 50 WHERE order_id = ? AND shop_id = ?', [id, shops[1]]);
      await saveOrderBilling(connection, order, { priceEdit: true });
      await connection.commit();
    } finally { connection.release(); }
    expect(Number((await bill(id)).total)).toBe(120);
    await resendShopOrder(shops[1], id);
    expect(Number((await bill(id)).total)).toBe(120);
    await confirmShopOrder(shops[1], id);
    expect(Number((await bill(id)).total)).toBe(170);
  });
});
