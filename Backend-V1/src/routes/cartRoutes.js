const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { calculateCart } = require('../controllers/cartController');

const { requireCustomer } = require('../middleware/authMiddleware');

router.post('/calculate', requireCustomer, asyncHandler(calculateCart));

module.exports = router;
