const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getDashboard, getSectionItems } = require('../controllers/dashboardController');

router.get('/', asyncHandler(getDashboard));
router.get('/sections/:slug/items', asyncHandler(getSectionItems));

module.exports = router;
