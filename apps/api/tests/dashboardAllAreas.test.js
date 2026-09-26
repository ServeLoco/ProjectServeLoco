/**
 * GET /api/admin/dashboard with X-Area-Id: all — the super admin's landing
 * page. It used to 400 ("cannot target all areas"), leaving a dead page (and
 * a retry loop in the browser) on "All areas".
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../src/db/mysql');
const areaScope = require('../src/utils/areaScope');
const adminRoutes = require('../src/routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const superToken = jwt.sign({ id: 'super', role: 'admin', adminRole: 'super_admin', areaId: null }, process.env.JWT_SECRET || 'secret');
const areaToken = jwt.sign({ id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 1 }, process.env.JWT_SECRET || 'secret');

const AREAS = [
  { id: 1, code: 'A1', name: 'Hisar', active: 1 },
  { id: 2, code: 'A2', name: 'Bengaluru', active: 1 },
  { id: 3, code: 'A3', name: 'Closed town', active: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  areaScope._resetCachesForTests();
  pool.query.mockImplementation(async (sql) => {
    const q = String(sql);
    if (q.includes('FROM areas')) return [AREAS];
    if (q.includes('FROM orders GROUP BY area_id')) {
      return [[
        { area_id: 1, today_orders: 3, today_sales: '300.00', pending_orders: 1, delivered_orders: 2, cash_total: 100, upi_total: 200, pending_payment_total: 0 },
        { area_id: 2, today_orders: 2, today_sales: '150.50', pending_orders: 2, delivered_orders: 0, cash_total: 150.5, upi_total: 0, pending_payment_total: 50 },
      ]];
    }
    if (q.includes('SELECT * FROM orders')) return [[{ id: 9, order_number: 'OD-1', area_id: 2, total: 99 }]];
    if (q.includes('FROM products')) return [[{ id: 5, name: 'Milk', price: 30, area_id: 1 }]];
    if (q.includes('FROM order_items')) return [[{ area_id: 2, product_id: 13, item_type: 'product', product_name: 'Burger', total_quantity: 4, total_sales: 400 }]];
    if (q.includes('FROM settings')) {
      return [[
        { area_id: 1, shop_open: 1, delivery_available: 1, rain_charge_enabled: 0 },
        { area_id: 2, shop_open: 0, delivery_available: 0, rain_charge_enabled: 1 },
      ]];
    }
    return [[]];
  });
});

describe('Dashboard on "All areas"', () => {
  it('sums every area\'s KPIs and lists each area with its own switches', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${superToken}`).set('X-Area-Id', 'all');

    expect(res.statusCode).toBe(200);
    const { data } = res.body;
    expect(data.allAreas).toBe(true);
    expect(data.sales).toMatchObject({ todayOrders: 5, todaySales: 450.5, pendingOrders: 3, pendingPaymentTotal: 50 });
    // Per-area switches do not sum into one value.
    expect(data.delivery_available).toBeNull();
    expect(data.areas.map((a) => a.code)).toEqual(['A1', 'A2']); // inactive area with no orders is left out
    expect(data.areas[1]).toMatchObject({ code: 'A2', todayOrders: 2, pendingOrders: 2, deliveryAvailable: false, shopOpen: false, rainChargeEnabled: true });
    expect(data.latest_orders[0]).toMatchObject({ id: 9, area_code: 'A2' });
    expect(data.product_alerts[0]).toMatchObject({ name: 'Milk', area_code: 'A1' });
    expect(data.top_products[0]).toMatchObject({ product_name: 'Burger', area_code: 'A2' });
  });

  it('an area admin still gets only their own area (no header allowed)', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${areaToken}`).set('X-Area-Id', 'all');
    expect(res.statusCode).toBe(403);
  });

  it('super admin with no area picked still gets a 400, not a silent default', async () => {
    const res = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${superToken}`);
    expect(res.statusCode).toBe(400);
  });
});
