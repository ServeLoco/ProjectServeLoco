const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getDashboard, getSectionItems } = require('../controllers/dashboardController');
const { getDealPage, getOfferCardPage } = require('../controllers/offerCardController');
const { resolveCustomerArea } = require('../middleware/areaMiddleware');

router.get('/', resolveCustomerArea, asyncHandler(getDashboard));
router.get('/sections/:slug/items', resolveCustomerArea, asyncHandler(getSectionItems));
// "View all" page of a deal price offer (Home offer cards).
router.get('/deals/:couponId', resolveCustomerArea, asyncHandler(getDealPage));
// "See all" page of a product offer card (template 2, "Deals of the day").
router.get('/offer-cards/:cardId', resolveCustomerArea, asyncHandler(getOfferCardPage));

module.exports = router;
