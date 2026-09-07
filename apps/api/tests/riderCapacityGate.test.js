/**
 * Rider assignment capacity controls:
 *   1. A rider carrying their own riders.max_active_orders undelivered
 *      orders is excluded from new offers (listEligibleRiders) until one is
 *      Delivered/Cancelled.
 *   2. POST /api/orders rejects new checkouts once an area's non-terminal
 *      order count reaches the SUM of every online rider's own
 *      max_active_orders, surfacing a "riders are busy, try again in ~29
 *      minutes" message.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/db/mysql');
const { listEligibleRiders, ACTIVE_ORDER_STATUSES } = require('../src/utils/riders');
const config = require('../src/config/env');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn() },
}));

jest.mock('../src/utils/areaScope', () => ({
  resolveAreaIdForPricing: jest.fn().mockResolvedValue(1),
  getAreaById: jest.fn().mockResolvedValue({ id: 1, code: 'A1' }),
}));

jest.mock('../src/utils/coupons', () => ({
  validateCoupon: jest.fn().mockResolvedValue({ ok: false, reason: 'No coupon' }),
  validateCouponById: jest.fn().mockResolvedValue({ ok: false, reason: 'Coupon not found' }),
  pickBestAutoApply: jest.fn().mockResolvedValue(null),
}));

jest.mock('express-rate-limit', () => {
  const factory = () => (req, res, next) => next();
  factory.rateLimit = factory;
  factory.ipKeyGenerator = (ip) => String(ip);
  return factory;
});

jest.mock('../src/utils/notificationService', () => ({
  createOrderNotification: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/realtime/orderEvents', () => ({
  emitNotificationCreated: jest.fn(),
  emitOrderCreated: jest.fn(),
  emitOrderCancelled: jest.fn(),
}));
jest.mock('../src/utils/adminNotifications', () => ({
  createAdminNotification: jest.fn().mockResolvedValue(null),
  TYPES: { NEW_ORDER: 'new_order' },
}));
jest.mock('../src/realtime/orderAutoAccept', () => ({
  schedule: jest.fn(),
}));

const orderRoutes = require('../src/routes/orderRoutes');

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

const baseSettings = {
  shop_open: 1, delivery_available: 1, delivery_charge: 10, night_charge: 0, fast_delivery_enabled: 0,
};

const orderBody = {
  address: '123 Test St',
  paymentMethod: 'Cash',
  items: [{ productId: 1, quantity: 1 }],
};

describe('POST /api/orders — rider capacity gate', () => {
  beforeEach(() => jest.clearAllMocks());

  // The gate reads online_riders / active_orders as subqueries on the same
  // settings row, so a scenario is just a settings override — no extra
  // queries land in the transaction's mock queue.
  const mockConnectionFor = (settingsOverride = {}) => ({
    beginTransaction: jest.fn(),
    query: jest.fn()
      .mockResolvedValueOnce([[{ blocked: 0 }]]) // user check
      .mockResolvedValueOnce([[{ ...baseSettings, ...settingsOverride }]]) // settings + capacity counts
      .mockResolvedValueOnce([[{ id: 1, name: 'Test', price: 100, available: 1 }]]) // product
      .mockResolvedValueOnce([[]]) // exclusion zones
      .mockResolvedValueOnce([{ insertId: 5001 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValue([[]]),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  });

  const placeOrder = () => request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send(orderBody);

  it('rejects with RIDERS_AT_CAPACITY once active orders hit the sum of online riders\' own caps', async () => {
    // Two online riders, one capped at 4 and one at 2 -> capacity 6; 6 active orders in flight.
    pool.getConnection.mockResolvedValue(mockConnectionFor({ online_riders: 2, rider_capacity: 6, active_orders: 6 }));

    const res = await placeOrder();

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('RIDERS_AT_CAPACITY');
    expect(res.body.message).toMatch(/29 minutes/);
  });

  it('allows the order through when one under capacity', async () => {
    pool.getConnection.mockResolvedValue(mockConnectionFor({ online_riders: 2, rider_capacity: 6, active_orders: 5 }));

    const res = await placeOrder();

    expect(res.statusCode).toBe(201);
  });

  it('skips the gate when zero riders are online (delivery_available already covers that case)', async () => {
    pool.getConnection.mockResolvedValue(mockConnectionFor({ online_riders: 0, rider_capacity: 0, active_orders: 99 }));

    const res = await placeOrder();

    expect(res.statusCode).toBe(201);
  });

  it('respects per-rider caps, not a flat headcount — one heavy-capacity rider can carry the whole area', async () => {
    // 1 online rider whose own max_active_orders is 10 -> capacity 10.
    pool.getConnection.mockResolvedValue(mockConnectionFor({ online_riders: 1, rider_capacity: 10, active_orders: 9 }));

    const res = await placeOrder();

    expect(res.statusCode).toBe(201);
  });

  it('treats missing capacity columns as "not at capacity" rather than blocking checkout', async () => {
    // baseSettings carries no online_riders/active_orders at all.
    pool.getConnection.mockResolvedValue(mockConnectionFor());

    const res = await placeOrder();

    expect(res.statusCode).toBe(201);
  });

  it('counts capacity with an indexable status IN list scoped to the delivery area', async () => {
    const conn = mockConnectionFor({ online_riders: 1, active_orders: 0 });
    pool.getConnection.mockResolvedValue(conn);

    await placeOrder();

    const [sql, params] = conn.query.mock.calls[1];
    expect(sql).toContain('AS online_riders');
    expect(sql).toContain('AS active_orders');
    // NOT IN ('Delivered','Cancelled') would walk the area's whole order
    // history on every checkout; the IN list range-scans instead.
    expect(sql).not.toMatch(/status NOT IN/);
    expect(params).toContain(ACTIVE_ORDER_STATUSES);
  });

  // failAssignment deliberately leaves an order non-terminal for an admin to
  // resolve, so without a recency bound a permanently-stuck order would eat a
  // rider slot forever and enough of them would block the area's checkout for
  // good — behind a "try again in 29 minutes" message that never comes true.
  it('only counts recent orders, so a permanently-stuck one cannot eat a rider slot forever', async () => {
    const conn = mockConnectionFor({ online_riders: 1, active_orders: 0 });
    pool.getConnection.mockResolvedValue(conn);

    await placeOrder();

    const [sql, params] = conn.query.mock.calls[1];
    expect(sql).toMatch(/created_at > NOW\(\) - INTERVAL \? MINUTE/);
    expect(params).toContain(config.RIDER_CAPACITY_LOOKBACK_MIN);
    expect(config.RIDER_CAPACITY_LOOKBACK_MIN).toBeGreaterThan(0);
  });
});

describe('listEligibleRiders — per-rider active-order cap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SQL excludes riders at or over their own max_active_orders via a correlated subquery', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    await listEligibleRiders({ areaId: 1 });
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT COUNT\(\*\) FROM orders o/);
    expect(sql).toMatch(/status NOT IN \('Delivered', 'Cancelled'\)/);
    expect(sql).toMatch(/\) < r\.max_active_orders/);
  });
});
