/**
 * Zone pricing must be STRICT: when the platform prices by zone, a delivery
 * charge may only ever come from a zone the pin actually matched.
 *
 * The gap this covers: a valid pin that matches no zone in any area makes
 * resolveAreaIdForPricing return null (pinMatchedNoZone), and the controller
 * then falls the CATALOG scoping back to the default area purely so its
 * informational queries have an area id. If that fallback area happens to run
 * flat pricing, resolveDeliveryPricing has no geography check at all and
 * happily returns a full flat-priced quote — outOfRange: false, excluded:
 * false, a real settings.delivery_charge. The controller does mark
 * deliveryWithinRange/valid false, but every flag the CART screen actually
 * reads stays clean, so the customer saw a charge that no zone produced.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const cartRoutes = require('../src/routes/cartRoutes');
const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));

jest.mock('../src/utils/coupons', () => ({
  validateCoupon: jest.fn().mockResolvedValue({ ok: false, reason: 'No coupon' }),
  validateCouponById: jest.fn().mockResolvedValue({ ok: false, reason: 'Coupon not found' }),
  pickBestAutoApply: jest.fn().mockResolvedValue(null),
  findApplicableCoupons: jest.fn().mockResolvedValue([]),
  getNextFreeDeliveryThreshold: jest.fn().mockResolvedValue(null),
  getNearestUnlockableCoupon: jest.fn().mockResolvedValue(null),
  computeDiscount: jest.fn().mockReturnValue(0),
  checkEligibility: jest.fn().mockResolvedValue({ ok: false, reason: 'No coupon' }),
}));

const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);

const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

// A small square around (12.97, 77.60). Every pin used below is deliberately
// far outside it, so the zone match genuinely fails.
const ZONE_BOUNDARY = JSON.stringify([
  { lat: 12.96, lng: 77.59 },
  { lat: 12.98, lng: 77.59 },
  { lat: 12.98, lng: 77.61 },
  { lat: 12.96, lng: 77.61 },
]);

const AREA = {
  id: 1, code: 'A1', name: 'Area 1', active: 1, is_default: 1,
  min_lat: null, max_lat: null, min_lng: null, max_lng: null,
};

/**
 * Routes on SQL text rather than call order — the controller's query sequence
 * varies with the pricing mode under test, and ordered mocks would silently
 * hand a settings row to a zones query.
 */
function mockDb({ radiusPricingActive }) {
  pool.query.mockImplementation(async (sql) => {
    const q = String(sql);
    if (q.includes('FROM areas')) return [[AREA]];
    if (q.includes('FROM delivery_zones')) {
      return [[{
        id: 9, name: 'Zone A', active: 1, area_id: 1, boundary: ZONE_BOUNDARY,
        normal_charge: 55, fast_charge: 75, night_charge: 0,
        normal_eta_minutes: 40, fast_eta_minutes: 20, cod_enabled: 1, parent_zone_id: null,
      }]];
    }
    if (q.includes('FROM delivery_exclusion_zones')) return [[]];
    if (q.includes('FROM settings')) {
      return [[{
        shop_open: 1, delivery_charge: 10, night_charge: 0, rain_charge_enabled: 0,
        fast_delivery_enabled: 0, standard_delivery_minutes: 60, fast_delivery_minutes: 30,
        delivery_radius_km: 8, shop_latitude: 12.97, shop_longitude: 77.60,
        radius_pricing_active: radiusPricingActive,
      }]];
    }
    if (q.includes('FROM products')) return [[{ id: 1, name: 'Milk', price: 100 }]];
    return [[]];
  });
}

function calculate(pin) {
  return request(app)
    .post('/api/cart/calculate')
    .set('Authorization', `Bearer ${token}`)
    .send({ items: [{ productId: 1, quantity: 2 }], ...pin });
}

describe('a delivery charge may only come from a matched zone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('CONTROL: a pin inside a zone is priced from that zone', async () => {
    mockDb({ radiusPricingActive: 1 });

    const res = await calculate({ latitude: 12.97, longitude: 77.6 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.deliveryCharge).toEqual(55); // the zone's normal_charge, not settings' 10
    expect(res.body.outOfRange).toEqual(false);
    expect(res.body.deliveryWithinRange).toEqual(true);
    expect(res.body.deliveryZone).toMatchObject({ id: 9, name: 'Zone A' });
  });

  it('never quotes a flat charge for a pin that matched no zone', async () => {
    // The fallback default area runs FLAT pricing, so resolveDeliveryPricing
    // has no geography check of its own to catch this pin.
    mockDb({ radiusPricingActive: 0 });

    const res = await calculate({ latitude: 25.0, longitude: 80.0 }); // nowhere near the zone

    expect(res.statusCode).toEqual(200);
    // The verdict the server already got right.
    expect(res.body.deliveryWithinRange).toEqual(false);
    expect(res.body.valid).toEqual(false);
    // The flags the cart screen actually reads must agree with that verdict,
    // and no charge may survive it.
    expect(res.body.outOfRange).toEqual(true);
    expect(res.body.deliveryCharge).toEqual(0);
    expect(res.body.deliveryZone).toBeNull();
  });

  it('zeroes the charge for an unmatched pin under zone pricing too', async () => {
    mockDb({ radiusPricingActive: 1 });

    const res = await calculate({ latitude: 25.0, longitude: 80.0 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.outOfRange).toEqual(true);
    expect(res.body.deliveryCharge).toEqual(0);
    expect(res.body.deliveryWithinRange).toEqual(false);
  });
});
