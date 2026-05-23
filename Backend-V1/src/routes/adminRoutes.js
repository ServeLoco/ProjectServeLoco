const express = require('express');
const { login, me, getAdminCustomers, setBlockStatus, setTrustStatus, getDashboard, getSalesReport, getAdminOrders, getAdminOrderById, updateOrderStatus, updateOrderPayment } = require('../controllers/adminController');
const { getSettings, updateSettings, getActiveOffer, createOffer, updateOffer } = require('../controllers/settingsController');
const { createCategory, updateCategory } = require('../controllers/categoryController');
const { createProduct, updateProduct, getAdminProducts, getAdminProductById, deleteProduct, updateProductAvailability, updateProductImage } = require('../controllers/productController');
const { requireAdmin } = require('../middleware/authMiddleware');
const { validate, isString, isId, isBoolean, isNumericAmount, validatePagination, normalizeField } = require('../validators');
const asyncHandler = require('../utils/asyncHandler');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per `window`
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, please try again later.' }
});

const loginSchema = (req) => {
  const errors = {};
  const data = {
    id: normalizeField(req, 'ownerId', 'owner_id'),
    password: normalizeField(req, 'password', 'password')
  };

  if (!isString(data.id)) errors.id = 'Admin ID is required';
  if (!isString(data.password)) errors.password = 'Password is required';

  return { errors, data };
};

const paginationSchema = (req) => {
  const page = normalizeField(req, 'page', 'page');
  const limit = normalizeField(req, 'limit', 'limit');
  return { errors: {}, data: validatePagination(page, limit) };
};

const blockSchema = (req) => {
  const errors = {};
  const data = {
    id: req.params.id,
    blocked: normalizeField(req, 'blocked', 'blocked')
  };

  if (!isId(data.id)) errors.id = 'Valid User ID is required in URL';
  if (!isBoolean(data.blocked)) errors.blocked = 'Blocked status must be a boolean';

  // Normalize boolean
  data.blocked = data.blocked === true || data.blocked === 'true' || data.blocked === 1;

  return { errors, data };
};

const trustSchema = (req) => {
  const errors = {};
  const data = {
    id: req.params.id,
    trusted: normalizeField(req, 'trusted', 'trusted')
  };

  if (!isId(data.id)) errors.id = 'Valid User ID is required in URL';
  if (!isBoolean(data.trusted)) errors.trusted = 'Trusted status must be a boolean';

  data.trusted = data.trusted === true || data.trusted === 'true' || data.trusted === 1;

  return { errors, data };
};

const categorySchema = (req) => {
  const data = {
    name: normalizeField(req, 'name', 'name'),
    slug: normalizeField(req, 'slug', 'slug'),
    type: normalizeField(req, 'type', 'type'),
    image_id: normalizeField(req, 'imageId', 'image_id'),
    active: normalizeField(req, 'active', 'active')
  };
  const errors = {};
  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isString(data.slug)) errors.slug = 'Slug is required';
  if (!isString(data.type)) errors.type = 'Type is required';
  if (data.active !== undefined && !isBoolean(data.active)) errors.active = 'Active must be boolean';
  
  if (data.active !== undefined) {
    data.active = data.active === true || data.active === 'true' || data.active === 1;
  }
  return { errors, data };
};

const productSchema = (req) => {
  const data = {
    name: normalizeField(req, 'name', 'name'),
    price: normalizeField(req, 'price', 'price'),
    category_id: normalizeField(req, 'categoryId', 'category_id'),
    unit: normalizeField(req, 'unit', 'unit'),
    description: normalizeField(req, 'description', 'description'),
    image_id: normalizeField(req, 'imageId', 'image_id'),
    available: normalizeField(req, 'available', 'available')
  };
  const errors = {};
  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isNumericAmount(data.price)) errors.price = 'Valid price is required';
  if (!isId(data.category_id)) errors.category_id = 'Category ID is required';
  if (data.available !== undefined && !isBoolean(data.available)) errors.available = 'Available must be boolean';
  
  if (data.available !== undefined) {
    data.available = data.available === true || data.available === 'true' || data.available === 1;
  }
  return { errors, data };
};

// Routes
router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', requireAdmin, me);
router.get('/customers', requireAdmin, validate(paginationSchema), asyncHandler(getAdminCustomers));
router.put('/customers/:id/block', requireAdmin, validate(blockSchema), asyncHandler(setBlockStatus));
router.patch('/customers/:id/block', requireAdmin, validate(blockSchema), asyncHandler(setBlockStatus)); // alias to match task
router.put('/customers/:id/trust', requireAdmin, validate(trustSchema), asyncHandler(setTrustStatus));
router.patch('/customers/:id/trust', requireAdmin, validate(trustSchema), asyncHandler(setTrustStatus)); // alias to match task
router.post('/categories', requireAdmin, validate(categorySchema), asyncHandler(createCategory));
router.put('/categories/:id', requireAdmin, validate(categorySchema), asyncHandler(updateCategory));

router.get('/products', requireAdmin, asyncHandler(getAdminProducts));
router.get('/products/:id', requireAdmin, asyncHandler(getAdminProductById));
router.post('/products', requireAdmin, validate(productSchema), asyncHandler(createProduct));
router.put('/products/:id', requireAdmin, validate(productSchema), asyncHandler(updateProduct));
router.patch('/products/:id', requireAdmin, validate(productSchema), asyncHandler(updateProduct));
router.delete('/products/:id', requireAdmin, asyncHandler(deleteProduct));
router.patch('/products/:id/availability', requireAdmin, asyncHandler(updateProductAvailability));
router.patch('/products/:id/image', requireAdmin, asyncHandler(updateProductImage));

router.get('/dashboard', requireAdmin, asyncHandler(getDashboard));
router.get('/reports/sales', requireAdmin, asyncHandler(getSalesReport));
router.get('/orders', requireAdmin, asyncHandler(getAdminOrders));
router.get('/orders/:id', requireAdmin, asyncHandler(getAdminOrderById));
router.patch('/orders/:id/status', requireAdmin, asyncHandler(updateOrderStatus));
router.patch('/orders/:id/payment', requireAdmin, asyncHandler(updateOrderPayment));

router.get('/settings', requireAdmin, asyncHandler(getSettings));
router.patch('/settings', requireAdmin, asyncHandler(updateSettings));
router.get('/offers/active', requireAdmin, asyncHandler(getActiveOffer));
router.post('/offers', requireAdmin, asyncHandler(createOffer));
router.patch('/offers/:id', requireAdmin, asyncHandler(updateOffer));

module.exports = router;
