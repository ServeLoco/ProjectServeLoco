// Report insights against a real MySQL: the trend must add up to the profit
// summary, and the customer / cancel / rejection figures must count what the
// order rows actually say. Fixtures sit in February 2001 so a custom range
// isolates them from any other rows in the test database.
const { describeWithMysql, assertMysqlReady, pool, FIXTURE_TAG, createUser, createOrderRow, cleanupFixtures } = require('../helpers/realMysql');
const reports = require('../../src/controllers/adminController');

const PERIOD = { period: 'custom', from: '2001-02-01', to: '2001-02-10' };

const report = async (name, query = PERIOD) => {
  let body;
  const res = { status: jest.fn().mockReturnThis(), json: (value) => { body = value; } };
  await reports[name]({ areaId: 1, admin: { adminRole: 'area_admin', areaId: 1 }, query }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  return body;
};

describeWithMysql('profit insights (real MySQL)', () => {
  let shopId;
  let productId;
  let categoryId;

  // createdAt is UTC (the test server and session run in UTC); the business
  // day/hour is +05:30, so '2001-02-03 04:00:00' is 3 Feb, 09:30.
  const order = async (customerId, createdAt, { status = 'Delivered', subtotal = 200, total = 220, discount = 0, coupon = null, cancelReason = null, items = [] } = {}) => {
    const id = await createOrderRow(customerId, { status });
    await pool.query(
      `UPDATE orders SET created_at = ?, subtotal = ?, delivery_charge = ?, total = ?, discount_amount = ?,
        coupon_code = ?, coupon_title = ?, cancel_reason = ? WHERE id = ?`,
      [createdAt, subtotal, total - subtotal + discount, total, discount, coupon, coupon ? `${coupon} title` : null, cancelReason, id]
    );
    for (const item of items) {
      await pool.query(
        `INSERT INTO order_items (order_id, area_id, shop_id, product_id, item_type, product_name, quantity,
          unit_price, line_total, shop_unit_price, shop_line_total, shop_rejected_at, shop_billable)
         VALUES (?, 1, ?, ?, 'product', ?, 1, ?, ?, ?, ?, ?, ?)`,
        [id, shopId, productId, `${FIXTURE_TAG} item`, item.price, item.price, item.cost, item.cost,
          item.rejected ? createdAt : null, item.rejected ? 0 : 1]
      );
    }
    return id;
  };

  beforeAll(async () => {
    await assertMysqlReady();
    const [category] = await pool.query("INSERT INTO categories (name, slug, type, area_id) VALUES (?, ?, 'packed', 1)",
      [`${FIXTURE_TAG} Insights`, `${FIXTURE_TAG.toLowerCase()}-insights`]);
    categoryId = category.insertId;
    const [shop] = await pool.query('INSERT INTO shops (name, area_id, active, is_open) VALUES (?, 1, 1, 1)', [`${FIXTURE_TAG} Insights Shop`]);
    shopId = shop.insertId;
    const [product] = await pool.query('INSERT INTO products (name, price, shop_id, category_id, area_id) VALUES (?, 100, ?, ?, 1)',
      [`${FIXTURE_TAG} Insights Product`, shopId, categoryId]);
    productId = product.insertId;

    const returning = await createUser('Returning Customer');
    const fresh = await createUser('New Customer');
    const other = await createUser('Cancelling Customer');

    // Before the period: makes `returning` a returning customer.
    await order(returning, '2001-01-20 06:00:00', { items: [{ price: 200, cost: 150 }] });
    // In the period.
    await order(returning, '2001-02-03 04:00:00', { items: [{ price: 120, cost: 90 }, { price: 80, cost: 60, rejected: true }], subtotal: 120, total: 140 });
    await order(returning, '2001-02-05 12:40:00', { items: [{ price: 200, cost: 120 }] });
    await order(fresh, '2001-02-03 04:30:00', { items: [{ price: 300, cost: 200 }], subtotal: 300, total: 290, discount: 30, coupon: `${FIXTURE_TAG}OFF` });
    await order(other, '2001-02-04 08:00:00', { status: 'Cancelled', subtotal: 150, total: 150, cancelReason: 'Out of stock' });
    await order(other, '2001-02-06 08:00:00', { status: 'Pending', subtotal: 99, total: 99 });
  });

  afterAll(async () => {
    await cleanupFixtures();
    if (productId) await pool.query('DELETE FROM products WHERE id = ?', [productId]);
    if (categoryId) await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
    if (shopId) await pool.query('DELETE FROM shops WHERE id = ?', [shopId]);
    await pool.end();
  });

  it('daily trend adds up to the profit summary', async () => {
    const summary = await report('getProfitSummary');
    const insights = await report('getProfitInsights');
    const { points, granularity } = insights.trend;

    expect(granularity).toBe('day');
    expect(points.map((p) => p.key)).toEqual([
      '2001-02-01', '2001-02-02', '2001-02-03', '2001-02-04', '2001-02-05',
      '2001-02-06', '2001-02-07', '2001-02-08', '2001-02-09', '2001-02-10',
    ]);
    // 3 Feb: 140 + 290 paid, shop cost 90 + 200 (the rejected line costs nothing).
    expect(points[2]).toMatchObject({ deliveredOrders: 2, customerPaid: 430, shopCost: 290, netProfit: 140 });
    expect(points[4]).toMatchObject({ deliveredOrders: 1, customerPaid: 220, shopCost: 120, netProfit: 100 });
    expect(points[3]).toMatchObject({ deliveredOrders: 0, netProfit: 0 });

    const sum = (key) => points.reduce((total, p) => total + p[key], 0);
    expect(sum('deliveredOrders')).toBe(summary.totals.deliveredOrders);
    expect(sum('customerPaid')).toBeCloseTo(summary.totals.customerPaid, 2);
    expect(sum('shopCost')).toBeCloseTo(summary.totals.shopCost, 2);
    expect(sum('netProfit')).toBeCloseTo(summary.totals.netProfit, 2);
    expect(summary.totals.netProfit).toBe(240);
  });

  it('busiest hours use the business-timezone hour of each delivered order', async () => {
    const insights = await report('getProfitInsights');
    expect(insights.hours).toHaveLength(24);
    expect(insights.hours[9]).toMatchObject({ deliveredOrders: 1, customerPaid: 140 }); // 04:00 UTC
    expect(insights.hours[10]).toMatchObject({ deliveredOrders: 1, customerPaid: 290 }); // 04:30 UTC
    expect(insights.hours[18]).toMatchObject({ deliveredOrders: 1, customerPaid: 220 }); // 12:40 UTC
    expect(insights.hours.reduce((total, h) => total + h.deliveredOrders, 0)).toBe(3);
    expect(insights.busiestHour).toBe(9);
  });

  it('splits customers into new and returning by their first delivered order', async () => {
    const { customers } = await report('getProfitInsights');
    expect(customers).toMatchObject({
      customers: 2,
      newCustomers: 1,
      returningCustomers: 1,
      newCustomerOrders: 1,
      returningCustomerOrders: 2,
      newCustomerPaid: 290,
      returningCustomerPaid: 360,
      repeatCustomers: 1,
      repeatRate: 50,
      ordersPerCustomer: 1.5,
      spendPerCustomer: 325,
    });
  });

  it('counts cancels, shop rejections and coupon cost', async () => {
    const { losses } = await report('getProfitInsights');
    expect(losses).toMatchObject({
      placedOrders: 5,
      cancelledOrders: 1,
      cancelledValue: 150,
      cancelRate: 20,
      shopLines: 4,
      rejectedLines: 1,
      rejectedValue: 80,
      rejectRate: 25,
      discount: 30,
      discountedOrders: 1,
      discountedOrdersPaid: 290,
      deliveredOrders: 3,
    });
    expect(losses.cancelReasons).toEqual([{ reason: 'Out of stock', orders: 1, value: 150 }]);
    expect(losses.rejectionsByShop).toEqual([
      expect.objectContaining({ shopId, rejectedLines: 1, lines: 4, rejectedValue: 80, rejectRate: 25 }),
    ]);
    expect(losses.topCoupons).toEqual([
      expect.objectContaining({ code: `${FIXTURE_TAG}OFF`, orders: 1, cost: 30, customerPaid: 290 }),
    ]);
  });

  it('all time treats every customer as new and spans first to last delivered day', async () => {
    const insights = await report('getProfitInsights', { period: 'all' });
    expect(insights.customers.newCustomers).toBe(insights.customers.customers);
    expect(insights.customers.returningCustomers).toBe(0);
    const summary = await report('getProfitSummary', { period: 'all' });
    const total = insights.trend.points.reduce((sum, p) => sum + p.netProfit, 0);
    expect(total).toBeCloseTo(summary.totals.netProfit, 2);
  });
});
