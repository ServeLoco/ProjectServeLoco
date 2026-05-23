const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { calculateCart } = require('../controllers/cartController');

router.post('/calculate', asyncHandler(calculateCart));

module.exports = router;
