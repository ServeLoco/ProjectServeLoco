const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getSettings } = require('../controllers/settingsController');

router.get('/', asyncHandler(getSettings));

module.exports = router;
