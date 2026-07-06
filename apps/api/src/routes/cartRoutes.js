const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { calculateCart, validateCouponHandler, getAvailableCoupons } = require('../controllers/cartController');
const { requireCustomer } = require('../middleware/authMiddleware');

const getLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skip: (req) => req.method !== 'GET'
});

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many cart requests, please slow down.' }
});

router.use(getLimiter);

router.post('/calculate', postLimiter, requireCustomer, asyncHandler(calculateCart));
router.post('/validate-coupon', postLimiter, requireCustomer, asyncHandler(validateCouponHandler));
router.get('/available-coupons', requireCustomer, asyncHandler(getAvailableCoupons));

module.exports = router;