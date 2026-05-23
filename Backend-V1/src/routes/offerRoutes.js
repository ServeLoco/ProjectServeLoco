const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getActiveOffer } = require('../controllers/settingsController');

router.get('/active', asyncHandler(getActiveOffer));

module.exports = router;
