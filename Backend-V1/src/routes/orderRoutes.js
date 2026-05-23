const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { createOrder, getOrders, getOrderById, cancelOrder } = require('../controllers/orderController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isString, isEnum, isNumericAmount } = require('../validators');

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
      if (!isNumericAmount(item.quantity) || Number(item.quantity) <= 0) {
        errors.items = `Item ${i + 1}: valid quantity is required`;
      }
    }
  }

  return { errors, data };
};

router.post('/', requireCustomer, validate(createOrderSchema), asyncHandler(createOrder));
router.get('/', requireCustomer, asyncHandler(getOrders));
router.get('/:id', requireCustomer, asyncHandler(getOrderById));
router.patch('/:id/cancel', requireCustomer, asyncHandler(cancelOrder));
router.post('/:id/cancel', requireCustomer, asyncHandler(cancelOrder)); // alias for frontend

module.exports = router;
