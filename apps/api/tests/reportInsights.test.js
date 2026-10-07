const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const adminRoutes = require('../src/routes/adminRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const token = jwt.sign({ id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 1 }, process.env.JWT_SECRET || 'secret');

// The insights queries run in parallel, so answer each by what it selects
// rather than by call order.
const mockInsightQueries = ({ days = [], dayCosts = [], hours = [], customers = {}, placed = {}, reasons = [], shops = [], discount = {}, coupons = [] } = {}) => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('AS biz_day') && sql.includes('shop_cost')) return [dayCosts];
    if (sql.includes('AS biz_day')) return [days];
    if (sql.includes('AS hour_of_day')) return [hours];
    if (sql.includes('AS new_customers')) return [[{ customers: 0, new_customers: 0, repeat_customers: 0, order_count: 0, new_customer_orders: 0, customer_paid: 0, new_customer_paid: 0, ...customers }]];
    if (sql.includes('AS placed_orders')) return [[{ placed_orders: 0, cancelled_orders: 0, cancelled_value: 0, ...placed }]];
    if (sql.includes('AS reason')) return [reasons];
    if (sql.includes('AS rejected_lines')) return [shops];
    if (sql.includes('AS discounted_orders')) return [[{ delivered_orders: 0, discounted_orders: 0, discount: 0, deal_discount: 0, free_delivery_waiver: 0, discounted_orders_paid: 0, app_sales: 0, ...discount }]];
    if (sql.includes('o.coupon_code, MAX')) return [coupons];
    throw new Error(`unexpected query: ${sql}`);
  });
};

const get = (query) => request(app)
  .get(`/api/admin/reports/profit/insights?${query}`)
  .set('Authorization', `Bearer ${token}`);

describe('GET /reports/profit/insights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an invalid period', async () => {
    const res = await get('period=forever');
    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns zeros, not NaN, when nothing happened', async () => {
    mockInsightQueries();
    const res = await get('period=custom&from=2026-01-01&to=2026-01-03');
    expect(res.statusCode).toBe(200);
    expect(res.body.trend.points.map((p) => p.key)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(res.body.trend.points.every((p) => p.netProfit === 0)).toBe(true);
    expect(res.body.busiestHour).toBeNull();
    expect(res.body.customers).toMatchObject({ repeatRate: 0, ordersPerCustomer: 0, spendPerCustomer: 0 });
    expect(res.body.losses).toMatchObject({ cancelRate: 0, rejectRate: 0, discountShareOfSales: 0 });
  });

  it('switches to monthly bars for long ranges and fills empty months', async () => {
    mockInsightQueries({
      days: [
        { biz_day: '2026-01-15', delivered_orders: 2, app_sales: '400.00', customer_paid: '440.00' },
        { biz_day: '2026-01-20', delivered_orders: 1, app_sales: '100.00', customer_paid: '110.50' },
        { biz_day: '2026-03-02', delivered_orders: 1, app_sales: '50.00', customer_paid: '60.00' },
      ],
      dayCosts: [
        { biz_day: '2026-01-15', shop_cost: '300.00' },
        { biz_day: '2026-03-02', shop_cost: '70.00' },
      ],
    });
    const res = await get('period=custom&from=2026-01-01&to=2026-03-31');
    expect(res.body.trend.granularity).toBe('month');
    expect(res.body.trend.points).toEqual([
      { key: '2026-01', deliveredOrders: 3, appSales: 500, customerPaid: 550.5, shopCost: 300, netProfit: 250.5 },
      { key: '2026-02', deliveredOrders: 0, appSales: 0, customerPaid: 0, shopCost: 0, netProfit: 0 },
      { key: '2026-03', deliveredOrders: 1, appSales: 50, customerPaid: 60, shopCost: 70, netProfit: -10 },
    ]);
  });

  it('checks new customers against orders before the period, in the same area', async () => {
    mockInsightQueries();
    await get('period=custom&from=2026-01-01&to=2026-01-03');
    const [sql, params] = pool.query.mock.calls.find(([q]) => q.includes('AS new_customers'));
    expect(sql).toContain('p.area_id = ?');
    expect(params.slice(2, 4)).toEqual(['2026-01-01', 1]);
  });

  it('treats everyone as new for all time', async () => {
    mockInsightQueries({ customers: { customers: 4, new_customers: 4, order_count: 6 } });
    const res = await get('period=all');
    const [sql] = pool.query.mock.calls.find(([q]) => q.includes('AS new_customers'));
    expect(sql).not.toContain('EXISTS');
    expect(res.body.customers).toMatchObject({ customers: 4, newCustomers: 4, returningCustomers: 0, ordersPerCustomer: 1.5 });
    expect(res.body.trend.points).toEqual([]);
  });

  it('ranks shops by rejections and skips shops with none', async () => {
    mockInsightQueries({
      shops: [
        { shop_id: 1, shop_name: 'Clean Shop', area_id: 1, item_lines: 10, rejected_lines: 0, rejected_value: '0.00' },
        { shop_id: 2, shop_name: 'Busy Shop', area_id: 1, item_lines: 8, rejected_lines: 2, rejected_value: '150.00' },
        { shop_id: 3, shop_name: null, area_id: 1, item_lines: 2, rejected_lines: 2, rejected_value: '40.00' },
      ],
    });
    const res = await get('period=today');
    const { losses } = res.body;
    expect(losses).toMatchObject({ shopLines: 20, rejectedLines: 4, rejectedValue: 190, rejectRate: 20 });
    expect(losses.rejectionsByShop.map((s) => [s.shopName, s.rejectRate])).toEqual([
      ['Busy Shop', 25],
      ['Deleted Shop', 100],
    ]);
  });
});
