const express = require('express');
const { requireCustomer } = require('../middleware/authMiddleware');
const { requireShopOwner } = require('../middleware/shopOwnerMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const {
  getMyShop,
  toggleMyShop,
  getMyProducts,
  toggleMyProduct,
  getMyOrders,
  confirmMyOrder,
} = require('../controllers/shopOwnerController');

const router = express.Router();

// Every shop-owner route requires a valid customer JWT (role: 'customer') AND
// that the user owns an active shop. The shop is derived from the JWT — a
// client can never pass a shopId.
router.use(requireCustomer);
router.use(requireShopOwner);

router.get('/me', asyncHandler(getMyShop));
router.patch('/me/toggle', asyncHandler(toggleMyShop));
router.get('/products', asyncHandler(getMyProducts));
router.patch('/products/:id/toggle', asyncHandler(toggleMyProduct));
router.get('/orders', asyncHandler(getMyOrders));
router.patch('/orders/:orderId/confirm', asyncHandler(confirmMyOrder));

module.exports = router;
