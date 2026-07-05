const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { createOrder, getOrders, getOrderById, cancelOrder } = require('../controllers/orderController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isEnum, isPositiveInteger, validateCoordinates } = require('../validators');
const { body, validationResult } = require('express-validator');

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
      product_id: item.product_id || item.productId
    }));
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.product_id) errors.items = `Item ${i + 1}: product_id is missing`;
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

router.post('/', requireCustomer, ...expressValidatorChecks, validateExpress, validate(createOrderSchema), asyncHandler(createOrder));
router.get('/', requireCustomer, asyncHandler(getOrders));
router.get('/:id', requireCustomer, asyncHandler(getOrderById));
router.patch('/:id/cancel', requireCustomer, asyncHandler(cancelOrder));
router.post('/:id/cancel', requireCustomer, asyncHandler(cancelOrder)); // alias for frontend

module.exports = router;
