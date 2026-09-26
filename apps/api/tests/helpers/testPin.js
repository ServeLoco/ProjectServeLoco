// A delivery pin inside a zone of area 1, for tests of the public catalog
// routes. Every app build sends its pin, and a pin-less public request
// resolves to NO area (resolveCustomerArea) — never the default area — so a
// test that wants area 1's catalog sends this pin, exactly like the app.
//
// Resolving it costs two pool.query calls before the controller's own:
// the areas list, then area 1's active zones (areaScope.resolveAreaForPoint).
// Both are cached, so the test must call areaScope._resetCachesForTests()
// in its beforeEach, as the area-aware tests already do.

const AREA_1 = {
  id: 1, code: 'A1', name: 'Area 1', active: 1, is_default: 1, catalog_version: 1,
  timezone: 'Asia/Kolkata', min_lat: null, max_lat: null, min_lng: null, max_lng: null,
};

const TEST_PIN = { latitude: 29.45, longitude: 75.66 };

const AREA_1_ZONE = {
  id: 1,
  area_id: 1,
  name: 'Test zone',
  parent_zone_id: null,
  active: 1,
  boundary: [
    { lat: 29.40, lng: 75.60 },
    { lat: 29.40, lng: 75.72 },
    { lat: 29.50, lng: 75.72 },
    { lat: 29.50, lng: 75.60 },
  ],
};

/** Queue the two lookups that resolve TEST_PIN to area 1. */
const mockPinInArea1 = (pool, area = AREA_1) => {
  pool.query.mockResolvedValueOnce([[area]]);
  pool.query.mockResolvedValueOnce([[AREA_1_ZONE]]);
};

module.exports = { AREA_1, AREA_1_ZONE, TEST_PIN, mockPinInArea1 };
