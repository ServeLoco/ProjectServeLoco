const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { getProducts, getProductById } = require('../controllers/productController');
const { resolveCustomerArea } = require('../middleware/areaMiddleware');
const { catalogETag } = require('../utils/areaScope');

const getLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skip: (req) => req.method !== 'GET'
});

router.use(getLimiter);

// 27.2 — catalogETag's ETag is keyed purely on <areaId>-<catalogVersion>, so
// it's only valid for the unfiltered "whole catalog" fetch. search/category/
// type/etc. all narrow the response body without changing catalog_version —
// applying the same ETag to those would 304 a genuinely different result
// set. Skip straight to the real handler whenever any of those are present.
//
// limit/offset and includeClosedShops belong in this list for exactly the
// same reason and were missing: page 2 of the catalog carries the identical
// <areaId>-<catalogVersion> ETag as page 1, so any client (or intermediary
// cache) doing a conditional GET gets a 304 and renders page 1's body for
// page 2. Keep this list in sync with every query param getProducts reads.
const ETAG_BUSTING_PARAMS = [
  'categoryId', 'category_id', 'search', 'type', 'storeType', 'store_type',
  'isCombo', 'is_combo', 'featured', 'offerId', 'offer_id',
  'limit', 'offset', 'includeClosedShops', 'include_closed_shops',
];

const productsCatalogETag = (req, res, next) => {
  if (ETAG_BUSTING_PARAMS.some((key) => req.query[key] !== undefined)) {
    return next();
  }
  return catalogETag(req, res, next);
};

router.get('/', resolveCustomerArea, productsCatalogETag, asyncHandler(getProducts));
// Bug fix (multi-area audit finding #4) — this had no area resolution at
// all, so any product/combo id was fetchable regardless of which area it
// belongs to: a public cross-area catalog leak. Same resolveCustomerArea
// pin -> zone -> area chain as every other customer catalog route; the
// controller itself now 404s a mismatched area_id.
router.get('/:id', resolveCustomerArea, asyncHandler(getProductById));

module.exports = router;
