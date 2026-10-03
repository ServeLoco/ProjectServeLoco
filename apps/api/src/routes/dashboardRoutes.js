const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getDashboard, getSectionItems } = require('../controllers/dashboardController');
const { getDealPage } = require('../controllers/offerCardController');
const { resolveCustomerArea } = require('../middleware/areaMiddleware');

router.get('/', resolveCustomerArea, asyncHandler(getDashboard));
router.get('/sections/:slug/items', resolveCustomerArea, asyncHandler(getSectionItems));
// "View all" page of a deal price offer (Home offer cards).
router.get('/deals/:couponId', resolveCustomerArea, asyncHandler(getDealPage));

module.exports = router;
