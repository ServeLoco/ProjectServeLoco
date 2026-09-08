const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { getBootstrap } = require('../controllers/bootstrapController');
const { resolveCustomerArea } = require('../middleware/areaMiddleware');
const { getAreaById } = require('../utils/areaScope');

const getLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skip: (req) => req.method !== 'GET'
});

router.use(getLimiter);

// Bootstrap's own body varies by zone too (its `zone` field is picked from
// req.zoneId, set by resolveCustomerArea from THIS request's pin) — unlike
// products/categories/settings/delivery-zones, which are area-scoped only
// and correctly ignore zone. The shared catalogETag's <areaId>-<catalogVersion>
// key would 304 a pin that moved to a different zone in the same area
// (same area, same catalog_version, different zone match), silently leaving
// the client on the previous zone. Key on zoneId too so a zone change always
// busts the cache even when nothing else did.
const bootstrapCatalogETag = async (req, res, next) => {
  try {
    const areaId = req.areaId;
    if (areaId == null || areaId === 'all') return next();
    const area = await getAreaById(areaId);
    if (!area) return next();

    const etag = `"${areaId}-${req.zoneId ?? 'none'}-${area.catalog_version}"`;
    // See areaScope.js's catalogETag for why this is required, not optional:
    // an ETag with no Cache-Control is heuristically cacheable (RFC 9111
    // §4.2.2), which on iOS means the shared URLCache can serve a stale
    // bootstrap without ever sending If-None-Match.
    res.set('Cache-Control', 'private, no-cache');
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    next();
  } catch (_) {
    next();
  }
};

router.get('/', resolveCustomerArea, bootstrapCatalogETag, asyncHandler(getBootstrap));

module.exports = router;
