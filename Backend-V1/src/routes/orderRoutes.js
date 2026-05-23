const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { createOrder, getOrders, getOrderById, cancelOrder } = require('../controllers/orderController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isString, isEnum, isNumericAmount } = require('../validators');

const createOrderSchema = (req) => {
  const errors = {};
  const data = { ...req.body };

  if (data.address && !isString(data.address)) errors.address = 'Invalid address string';
  if (data.payment_method && !isEnum(data.payment_method, ['Cash', 'UPI'])) {
    errors.payment_method = 'Payment method must be Cash or UPI';
  } else if (!data.payment_method) {
    data.payment_method = 'Cash';
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.items = 'Order must contain at least one item';
  } else {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item.product_id) errors.items = 'Product ID is missing';
      if (!isNumericAmount(item.quantity) || item.quantity <= 0) {
        errors.items = 'Valid quantity is required';
      }
    }
  }

  return { errors, data };
};

router.post('/', requireCustomer, validate(createOrderSchema), asyncHandler(createOrder));
router.get('/', requireCustomer, asyncHandler(getOrders));
router.get('/:id', requireCustomer, asyncHandler(getOrderById));
router.post('/:id/cancel', requireCustomer, asyncHandler(cancelOrder));

module.exports = router;
