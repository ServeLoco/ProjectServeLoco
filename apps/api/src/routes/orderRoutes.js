const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { createOrder, getOrders, getOrderById, cancelOrder } = require('../controllers/orderController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isEnum, isPositiveInteger, validateCoordinates, isId } = require('../validators');
const { body, validationResult } = require('express-validator');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const validateExpress = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = {};
    errors.array().forEach(err => {
      details[err.path || err.param] = err.msg;
    });
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request data', details });
  }
  next();
};

const createOrderSchema = (req) => {
  const errors = {};
  const data = { ...req.body };

  // Normalize camelCase vs snake_case from frontend
  if (data.paymentMethod && !data.payment_method) data.payment_method = data.paymentMethod;
  if (!data.payment_method) data.payment_method = 'Cash';
  if (data.payment_method && !isEnum(data.payment_method, ['Cash', 'UPI'])) {
    errors.payment_method = 'Payment method must be Cash or UPI';
  }
  if (data.mapUrl && !data.map_url) data.map_url = data.mapUrl;
  if (data.deliveryAddress && !data.address) data.address = data.deliveryAddress;
  if (data.deliveryType && !data.delivery_type) data.delivery_type = data.deliveryType;
  data.delivery_type = ['standard', 'fast'].includes(data.delivery_type) ? data.delivery_type : 'standard';

  // Coupon code (optional) — validated server-side in createOrder.
  if (data.couponCode && !data.coupon_code) data.coupon_code = data.couponCode;
  if (data.coupon_code) {
    data.coupon_code = String(data.coupon_code).trim().toUpperCase();
  }

  const customerLat = data.latitude !== undefined ? data.latitude : data.lat;
  const customerLng = data.longitude !== undefined ? data.longitude : data.lng;

  // Location is now optional - only validate if provided
  if (customerLat !== undefined && customerLat !== null && customerLat !== '') {
    if (customerLng === undefined || customerLng === null || customerLng === '') {
      errors.longitude = 'Longitude is required when latitude is provided';
    } else if (!validateCoordinates(customerLat, customerLng)) {
      errors.latitude = 'Invalid GPS coordinates provided';
    } else {
      data.latitude = Number(customerLat);
      data.longitude = Number(customerLng);
    }
  } else if (customerLng !== undefined && customerLng !== null && customerLng !== '') {
    errors.latitude = 'Latitude is required when longitude is provided';
  } else {
    // No coordinates provided - that's okay now
    data.latitude = null;
    data.longitude = null;
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.items = 'Order must contain at least one item';
  } else {
    // Normalize each item: accept productId (camelCase) or product_id (snake_case)
    data.items = data.items.map(item => ({
      ...item,
      product_id: item.product_id || item.productId,
      variant_id: item.variant_id || item.variantId || null
    }));
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.product_id) errors.items = `Item ${i + 1}: product_id is missing`;
      if (item.variant_id !== null && item.variant_id !== undefined && !isId(item.variant_id)) {
        errors.items = `Item ${i + 1}: valid variant_id is required`;
      } else {
        item.variant_id = item.variant_id !== null && item.variant_id !== undefined ? Number(item.variant_id) : null;
      }
      if (!isPositiveInteger(item.quantity)) {
        errors.items = `Item ${i + 1}: quantity must be a whole number between 1 and 999`;
      } else {
        item.quantity = Number(item.quantity);
      }
    }
  }

  return { errors, data };
};

const expressValidatorChecks = [
  body('customer_id').optional().isInt().withMessage('customer_id must be an integer'),
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('total').optional().isNumeric().withMessage('total must be numeric')
];

// Per-user cap on order creation: at most 5 orders/minute. Keyed on the
// authenticated user id (set by requireCustomer, which runs BEFORE this) so
// all devices for one account share a bucket; falls back to IP for safety.
// Use ipKeyGenerator for IPv6-safe IP keys (express-rate-limit v8+).
const orderLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => (
    req.user?.id != null
      ? String(req.user.id)
      : ipKeyGenerator(req.ip)
  ),
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many orders, please wait a minute.' }
});

router.post('/', requireCustomer, orderLimiter, ...expressValidatorChecks, validateExpress, validate(createOrderSchema), asyncHandler(createOrder));
router.get('/', requireCustomer, asyncHandler(getOrders));
router.get('/:id', requireCustomer, asyncHandler(getOrderById));
router.patch('/:id/cancel', requireCustomer, asyncHandler(cancelOrder));
router.post('/:id/cancel', requireCustomer, asyncHandler(cancelOrder)); // alias for frontend

module.exports = router;
