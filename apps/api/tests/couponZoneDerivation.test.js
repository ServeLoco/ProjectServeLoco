const request = require('supertest');
const express = require('express');
const cartRoutes = require('../src/routes/cartRoutes');
const { pool } = require('../src/db/mysql');
const jwt = require('jsonwebtoken');
const areaScope = require('../src/utils/areaScope');
const { bustUserState } = require('../src/utils/userState');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() }
}));

jest.mock('../src/utils/coupons', () => ({
  validateCoupon: jest.fn().mockResolvedValue({ ok: false, reason: 'No coupon' }),
  validateCouponById: jest.fn().mockResolvedValue({ ok: false, reason: 'Coupon not found' }),
  pickBestAutoApply: jest.fn().mockResolvedValue(null),
  applyBestDeal: jest.fn().mockResolvedValue({ deal: null, held: [] }),
  findApplicableCoupons: jest.fn().mockResolvedValue([]),
  getNextFreeDeliveryThreshold: jest.fn().mockResolvedValue(null),
  getNearestUnlockableCoupon: jest.fn().mockResolvedValue(null),
}));

const { validateCoupon, findApplicableCoupons } = require('../src/utils/coupons');

const app = express();
app.use(express.json());
app.use('/api/cart', cartRoutes);

const token = jwt.sign({ id: 1, role: 'customer' }, process.env.JWT_SECRET || 'secret');

const CENTER = { lat: 29.5152, lng: 75.4548 };
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG_AT_EQUATOR = 111.320;

const offsetPoint = (lat, lng, dLatKm, dLngKm) => ({
  lat: lat + dLatKm / KM_PER_DEG_LAT,
  lng: lng + dLngKm / (KM_PER_DEG_LNG_AT_EQUATOR * Math.cos(lat * Math.PI / 180)),
});

const squareBoundary = (sideKm) => {
  const half = sideKm / 2;
  return [
    offsetPoint(CENTER.lat, CENTER.lng, -half, -half),
    offsetPoint(CENTER.lat, CENTER.lng, -half, half),
    offsetPoint(CENTER.lat, CENTER.lng, half, half),
    offsetPoint(CENTER.lat, CENTER.lng, half, -half),
  ];
};

const ZONE_ROW = {
  id: 7, name: 'Main Village', parent_zone_id: null, boundary: squareBoundary(10),
  normal_charge: '10.00', fast_charge: '25.00',
  normal_eta_minutes: 45, fast_eta_minutes: 20, night_charge: '0.00',
  cod_enabled: 1, active: 1,
};

const AREA_ROW = { id: 1, code: 'A1', name: 'Area 1', active: 1, is_default: 1, min_lat: null, max_lat: null, min_lng: null, max_lng: null };

// TASK 10: a request carrying a pin now resolves which area it belongs to
// (via the outer pool, 2 queries: the areas list, then a zone-match check)
// before loading that area's pricing zones.
const queueAreaResolution = () => {
  pool.query
    .mockResolvedValueOnce([[AREA_ROW]])
    .mockResolvedValueOnce([[ZONE_ROW]]);
};

const ZONE_SETTINGS = {
  delivery_charge: '20.00',
  night_charge: 0,
  night_charge_start: null,
  night_charge_end: null,
  fast_delivery_enabled: 0,
  fast_delivery_charge: '40.00',
  standard_delivery_minutes: 60,
  fast_delivery_minutes: 30,
  shop_latitude: String(CENTER.lat),
  shop_longitude: String(CENTER.lng),
  radius_pricing_active: 1,
};

// A client-supplied delivery_zone_id would let anyone unlock a zone-restricted
// coupon (and enumerate which zones each coupon covers) by guessing ids.
describe('POST /api/cart/validate-coupon — zone is derived server-side', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // users.last_area_id is read through a 30s per-user cache
    // (utils/userState.js) — clear it so one case's row can't answer the next.
    bustUserState();
    areaScope._resetCachesForTests();
  });

  it('ignores a delivery_zone_id supplied in the request body', async () => {
    // TASK 13: area is resolved BEFORE settings now (settings itself is
    // area-scoped), so the order here is areas/zone-match, then settings,
    // then active zones.
    queueAreaResolution();
    pool.query.mockResolvedValueOnce([[ZONE_SETTINGS]]); // settings
    pool.query.mockResolvedValueOnce([[ZONE_ROW]]);     // active zones

    const res = await request(app)
      .post('/api/cart/validate-coupon')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'SAVE10',
        subtotal: 500,
        latitude: CENTER.lat,
        longitude: CENTER.lng,
        delivery_zone_id: 999, // attacker-chosen — must not reach the engine
      });

    expect(res.statusCode).toEqual(200);
    expect(validateCoupon).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 7 })
    );
  });

  it('refuses a pin outside every zone — no area, so no coupon of any area applies', async () => {
    // REGRESSION: this used to fall back to the customer's last-order area or
    // the default area and validate THAT area's coupon for someone standing
    // outside every zone.
    queueAreaResolution();

    const far = offsetPoint(CENTER.lat, CENTER.lng, 0, 50);
    const res = await request(app)
      .post('/api/cart/validate-coupon')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'SAVE10', subtotal: 500, latitude: far.lat, longitude: far.lng, delivery_zone_id: 7 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toMatch(/service area/i);
    expect(validateCoupon).not.toHaveBeenCalled();
  });

  it('no coordinates: uses the area the phone was last seen in, with no zone', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 2, current_area_id: 1, location_seen_at: new Date() }]]); // cached user row

    const res = await request(app)
      .post('/api/cart/validate-coupon')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'SAVE10', subtotal: 500, delivery_zone_id: 7 });

    expect(res.statusCode).toEqual(200);
    expect(validateCoupon).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: null, areaId: 1 })
    );
    // No settings/zone queries — only the user row.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('no coordinates and no recent sighting: refused — never the last-order or default area', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1, current_area_id: null, location_seen_at: null }]]);

    const res = await request(app)
      .post('/api/cart/validate-coupon')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'SAVE10', subtotal: 500 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.ok).toBe(false);
    expect(validateCoupon).not.toHaveBeenCalled();
  });

  it('rejects malformed coordinates instead of silently ignoring them', async () => {
    const res = await request(app)
      .post('/api/cart/validate-coupon')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'SAVE10', subtotal: 500, latitude: 999, longitude: 75.4 });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/Invalid GPS coordinates/i);
  });
});

// Same bypass, same fix, on the sibling endpoint that lists zone-restricted
// coupons/offers — it must derive zoneId from coordinates too, not trust a
// client-supplied delivery_zone_id.
describe('GET /api/cart/available-coupons — zone is derived server-side', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // users.last_area_id is read through a 30s per-user cache
    // (utils/userState.js) — clear it so one case's row can't answer the next.
    bustUserState();
    areaScope._resetCachesForTests();
  });

  it('ignores a delivery_zone_id supplied as a query param', async () => {
    // TASK 13: area is resolved BEFORE settings now (settings itself is
    // area-scoped), so the order here is areas/zone-match, then settings,
    // then active zones.
    queueAreaResolution();
    pool.query.mockResolvedValueOnce([[ZONE_SETTINGS]]); // settings
    pool.query.mockResolvedValueOnce([[ZONE_ROW]]);     // active zones

    const res = await request(app)
      .get('/api/cart/available-coupons')
      .set('Authorization', `Bearer ${token}`)
      .query({
        subtotal: 500,
        latitude: CENTER.lat,
        longitude: CENTER.lng,
        delivery_zone_id: 999, // attacker-chosen — must not reach the engine
      });

    expect(res.statusCode).toEqual(200);
    expect(findApplicableCoupons).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 7 })
    );
  });

  it('lists nothing for a pin outside every zone', async () => {
    queueAreaResolution();

    const far = offsetPoint(CENTER.lat, CENTER.lng, 0, 50);
    const res = await request(app)
      .get('/api/cart/available-coupons')
      .set('Authorization', `Bearer ${token}`)
      .query({ subtotal: 500, latitude: far.lat, longitude: far.lng, delivery_zone_id: 7 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toEqual([]);
    expect(findApplicableCoupons).not.toHaveBeenCalled();
  });

  it('no coordinates: lists the coupons of the area the phone was last seen in', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 2, current_area_id: 1, location_seen_at: new Date() }]]);

    const res = await request(app)
      .get('/api/cart/available-coupons')
      .set('Authorization', `Bearer ${token}`)
      .query({ subtotal: 500, delivery_zone_id: 7 });

    expect(res.statusCode).toEqual(200);
    expect(findApplicableCoupons).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: null, areaId: 1 })
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('no coordinates and no recent sighting: lists nothing', async () => {
    pool.query.mockResolvedValueOnce([[{ blocked: 0, last_area_id: 1, current_area_id: null, location_seen_at: null }]]);

    const res = await request(app)
      .get('/api/cart/available-coupons')
      .set('Authorization', `Bearer ${token}`)
      .query({ subtotal: 500 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toEqual([]);
    expect(findApplicableCoupons).not.toHaveBeenCalled();
  });

  it('rejects malformed coordinates instead of silently ignoring them', async () => {
    const res = await request(app)
      .get('/api/cart/available-coupons')
      .set('Authorization', `Bearer ${token}`)
      .query({ subtotal: 500, latitude: 999, longitude: 75.4 });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/Invalid GPS coordinates/i);
  });
});
