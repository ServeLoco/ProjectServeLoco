const express = require('express');
const { login, me, getAdminCustomers, getAdminCustomerById, setBlockStatus, setTrustStatus, getPasswordResetRequests, approvePasswordResetRequest, rejectPasswordResetRequest, getDashboard, getSalesReport, getTopProductsReport, getCustomersReport, getAdminOrders, getAdminOrderById, updateOrderStatus, updateOrderPayment, getAuditLogs, getAdminNotifications, createAdminNotification, getAdminNotificationById, deleteAdminNotification } = require('../controllers/adminController');
const { getSettings, updateSettings, getActiveOffer, createOffer, updateOffer, getAdminOffers, deleteOffer, getOfferProducts, addOfferProduct, removeOfferProduct, reorderOfferProducts } = require('../controllers/settingsController');
const { createCategory, deleteCategory, getAdminCategories, updateCategory } = require('../controllers/categoryController');
const { createProduct, updateProduct, getAdminProducts, getAdminProductById, deleteProduct, updateProductAvailability, updateProductImage } = require('../controllers/productController');
const { createCombo, updateCombo, getAdminCombos, getAdminComboById, deleteCombo, updateComboAvailability } = require('../controllers/comboController');
const {
  getAdminSections,
  getAdminSectionById,
  createAdminSection,
  updateAdminSection,
  deleteAdminSection,
  addAdminSectionItem,
  updateAdminSectionItem,
  deleteAdminSectionItem,
  reorderAdminSections,
  reorderAdminSectionItems
} = require('../controllers/dashboardController');
const { requireAdmin } = require('../middleware/authMiddleware');
const { auditLog } = require('../middleware/auditMiddleware');
const { validate, isString, isId, isBoolean, isNumericAmount, isPositiveInteger, isNonNegativeInteger, validatePagination, normalizeField } = require('../validators');
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
    active: normalizeField(req, 'active', 'active'),
    display_order: normalizeField(req, 'displayOrder', 'display_order')
  };
  const errors = {};
  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isString(data.type)) errors.type = 'Type is required';
  if (data.active !== undefined && !isBoolean(data.active)) errors.active = 'Active must be boolean';
  if (data.display_order !== undefined && !isNonNegativeInteger(data.display_order)) {
    errors.display_order = 'Display order must be a whole number greater than or equal to 0';
  }
  
  if (data.active !== undefined) {
    data.active = data.active === true || data.active === 'true' || data.active === 1;
  }
  if (data.display_order !== undefined) {
    data.display_order = Number(data.display_order);
  }
  return { errors, data };
};

const productSchema = (req) => {
  const rawComboItems = normalizeField(req, 'comboItems', 'combo_items');
  const data = {
    name: normalizeField(req, 'name', 'name'),
    price: normalizeField(req, 'price', 'price'),
    category_id: normalizeField(req, 'categoryId', 'category_id'),
    unit: normalizeField(req, 'unit', 'unit'),
    description: normalizeField(req, 'description', 'description'),
    image_id: normalizeField(req, 'imageId', 'image_id'),
    available: normalizeField(req, 'available', 'available'),
    is_combo: normalizeField(req, 'isCombo', 'is_combo'),
    featured: normalizeField(req, 'featured', 'featured'),
    display_order: normalizeField(req, 'displayOrder', 'display_order'),
    original_price: normalizeField(req, 'originalPrice', 'original_price'),
    discount_label: normalizeField(req, 'discountLabel', 'discount_label'),
    combo_items: Array.isArray(rawComboItems) ? rawComboItems.map((item, index) => ({
      product_id: item.productId || item.product_id || item.id,
      quantity: item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : 1),
      display_order: item.displayOrder || item.display_order || index,
    })) : undefined
  };
  const errors = {};
  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isNumericAmount(data.price)) errors.price = 'Valid price is required';
  if (!isId(data.category_id)) errors.category_id = 'Category ID is required';
  if (data.original_price !== undefined && data.original_price !== null && data.original_price !== '') {
    if (!isNumericAmount(data.original_price)) {
      errors.original_price = 'Original price must be a valid amount';
    } else if (isNumericAmount(data.price) && Number(data.original_price) < Number(data.price)) {
      errors.original_price = 'Original price cannot be lower than selling price';
    } else {
      data.original_price = Number(data.original_price);
    }
  }
  
  if (data.available !== undefined && !isBoolean(data.available)) errors.available = 'Available must be boolean';
  if (data.is_combo !== undefined && !isBoolean(data.is_combo)) errors.is_combo = 'is_combo must be boolean';
  if (data.featured !== undefined && !isBoolean(data.featured)) errors.featured = 'featured must be boolean';
  if (data.combo_items !== undefined) {
    for (let i = 0; i < data.combo_items.length; i++) {
      const item = data.combo_items[i];
      if (!isId(item.product_id)) errors.combo_items = `Combo item ${i + 1}: valid product is required`;
      if (!isPositiveInteger(item.quantity)) {
        errors.combo_items = `Combo item ${i + 1}: quantity must be a whole number between 1 and 999`;
      }
      item.quantity = Number(item.quantity) || 1;
      item.display_order = isNonNegativeInteger(item.display_order) ? Number(item.display_order) : i;
    }
  }
  
  if (data.available !== undefined) {
    data.available = data.available === true || data.available === 'true' || data.available === 1;
  }
  if (data.is_combo !== undefined) {
    data.is_combo = data.is_combo === true || data.is_combo === 'true' || data.is_combo === 1;
  }
  if (data.featured !== undefined) {
    data.featured = data.featured === true || data.featured === 'true' || data.featured === 1;
  }
  if (data.display_order !== undefined && !isNonNegativeInteger(data.display_order)) {
    errors.display_order = 'Display order must be a whole number greater than or equal to 0';
  }
  if (data.display_order !== undefined) {
    data.display_order = Number(data.display_order) || 0;
  }
  if (isNumericAmount(data.price)) {
    data.price = Number(data.price);
  }
  return { errors, data };
};

const comboSchema = (req) => {
  const rawComboItems = normalizeField(req, 'comboItems', 'combo_items');
  const data = {
    name: normalizeField(req, 'name', 'name'),
    price: normalizeField(req, 'price', 'price'),
    unit: normalizeField(req, 'unit', 'unit'),
    description: normalizeField(req, 'description', 'description'),
    image_id: normalizeField(req, 'imageId', 'image_id'),
    available: normalizeField(req, 'available', 'available'),
    featured: normalizeField(req, 'featured', 'featured'),
    display_order: normalizeField(req, 'displayOrder', 'display_order'),
    original_price: normalizeField(req, 'originalPrice', 'original_price'),
    discount_label: normalizeField(req, 'discountLabel', 'discount_label'),
    combo_items: Array.isArray(rawComboItems) ? rawComboItems.map((item, index) => ({
      product_id: item.productId || item.product_id || item.id,
      quantity: item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : 1),
      display_order: item.displayOrder || item.display_order || index,
    })) : undefined,
    store_type: normalizeField(req, 'storeType', 'store_type'),
  };
  const errors = {};
  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isNumericAmount(data.price)) errors.price = 'Valid price is required';
  if (data.original_price !== undefined && data.original_price !== null && data.original_price !== '') {
    if (!isNumericAmount(data.original_price)) {
      errors.original_price = 'Original price must be a valid amount';
    } else if (isNumericAmount(data.price) && Number(data.original_price) < Number(data.price)) {
      errors.original_price = 'Original price cannot be lower than selling price';
    } else {
      data.original_price = Number(data.original_price);
    }
  }
  
  if (data.available !== undefined && !isBoolean(data.available)) errors.available = 'Available must be boolean';
  if (!data.store_type || !['packed', 'fast_food'].includes(data.store_type)) {
    errors.store_type = 'Store type is required and must be either packed or fast_food';
  }
  if (data.featured !== undefined && !isBoolean(data.featured)) errors.featured = 'featured must be boolean';
  if (data.combo_items !== undefined) {
    for (let i = 0; i < data.combo_items.length; i++) {
      const item = data.combo_items[i];
      if (!isId(item.product_id)) errors.combo_items = `Combo item ${i + 1}: valid product is required`;
      if (!isPositiveInteger(item.quantity)) {
        errors.combo_items = `Combo item ${i + 1}: quantity must be a whole number between 1 and 999`;
      }
      item.quantity = Number(item.quantity) || 1;
      item.display_order = isNonNegativeInteger(item.display_order) ? Number(item.display_order) : i;
    }
  }
  
  if (data.available !== undefined) {
    data.available = data.available === true || data.available === 'true' || data.available === 1;
  }
  if (data.featured !== undefined) {
    data.featured = data.featured === true || data.featured === 'true' || data.featured === 1;
  }
  if (data.display_order !== undefined && !isNonNegativeInteger(data.display_order)) {
    errors.display_order = 'Display order must be a whole number greater than or equal to 0';
  }
  if (data.display_order !== undefined) {
    data.display_order = Number(data.display_order) || 0;
  }
  if (isNumericAmount(data.price)) {
    data.price = Number(data.price);
  }
  return { errors, data };
};

const productAvailabilitySchema = (req) => {
  const available = normalizeField(req, 'available', 'available');
  const isAvailable = normalizeField(req, 'isAvailable', 'is_available');
  const finalAvailable = available !== undefined ? available : isAvailable;
  const errors = {};

  if (!isId(req.params.id)) errors.id = 'Valid Product ID is required in URL';
  if (!isBoolean(finalAvailable)) errors.available = 'Availability status must be a boolean';

  return { errors, data: { id: req.params.id, available: finalAvailable } };
};

const comboAvailabilitySchema = (req) => {
  const available = normalizeField(req, 'available', 'available');
  const isAvailable = normalizeField(req, 'isAvailable', 'is_available');
  const finalAvailable = available !== undefined ? available : isAvailable;
  const errors = {};

  if (!isId(req.params.id)) errors.id = 'Valid Combo ID is required in URL';
  if (!isBoolean(finalAvailable)) errors.available = 'Availability status must be a boolean';

  return { errors, data: { id: req.params.id, available: finalAvailable } };
};

const productImageSchema = (req) => {
  const imageId = normalizeField(req, 'imageId', 'image_id');
  const errors = {};

  if (!isId(req.params.id)) errors.id = 'Valid Product ID is required in URL';
  if (!isString(imageId)) errors.image_id = 'Image ID is required';

  return { errors, data: { id: req.params.id, image_id: imageId } };
};

// Routes
router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', requireAdmin, me);

// Customers
router.get('/customers', requireAdmin, validate(paginationSchema), asyncHandler(getAdminCustomers));
router.get('/customers/:id', requireAdmin, asyncHandler(getAdminCustomerById));
router.put('/customers/:id/block', requireAdmin, validate(blockSchema), asyncHandler(setBlockStatus));
router.patch('/customers/:id/block', requireAdmin, validate(blockSchema), asyncHandler(setBlockStatus));
router.put('/customers/:id/trust', requireAdmin, validate(trustSchema), asyncHandler(setTrustStatus));
router.patch('/customers/:id/trust', requireAdmin, validate(trustSchema), asyncHandler(setTrustStatus));

router.get('/password-reset-requests', requireAdmin, asyncHandler(getPasswordResetRequests));
router.patch('/password-reset-requests/:id/approve', requireAdmin, auditLog, asyncHandler(approvePasswordResetRequest));
router.patch('/password-reset-requests/:id/reject', requireAdmin, auditLog, asyncHandler(rejectPasswordResetRequest));

router.get('/categories', requireAdmin, asyncHandler(getAdminCategories));
router.post('/categories', requireAdmin, auditLog, validate(categorySchema), asyncHandler(createCategory));
router.put('/categories/:id', requireAdmin, auditLog, validate(categorySchema), asyncHandler(updateCategory));
router.delete('/categories/:id', requireAdmin, auditLog, asyncHandler(deleteCategory));

router.get('/products', requireAdmin, asyncHandler(getAdminProducts));
router.get('/products/:id', requireAdmin, asyncHandler(getAdminProductById));
router.post('/products', requireAdmin, auditLog, validate(productSchema), asyncHandler(createProduct));
router.put('/products/:id', requireAdmin, auditLog, validate(productSchema), asyncHandler(updateProduct));
router.delete('/products/:id', requireAdmin, auditLog, asyncHandler(deleteProduct));
router.patch('/products/:id/availability', requireAdmin, auditLog, validate(productAvailabilitySchema), asyncHandler(updateProductAvailability));
router.patch('/products/:id/image', requireAdmin, auditLog, validate(productImageSchema), asyncHandler(updateProductImage));

router.get('/combos', requireAdmin, asyncHandler(getAdminCombos));
router.get('/combos/:id', requireAdmin, asyncHandler(getAdminComboById));
router.post('/combos', requireAdmin, auditLog, validate(comboSchema), asyncHandler(createCombo));
router.put('/combos/:id', requireAdmin, auditLog, validate(comboSchema), asyncHandler(updateCombo));
router.delete('/combos/:id', requireAdmin, auditLog, asyncHandler(deleteCombo));
router.patch('/combos/:id/availability', requireAdmin, auditLog, validate(comboAvailabilitySchema), asyncHandler(updateComboAvailability));

router.get('/dashboard', requireAdmin, asyncHandler(getDashboard));

// Admin Dashboard Sections CRUD
router.get('/dashboard-sections', requireAdmin, asyncHandler(getAdminSections));
router.post('/dashboard-sections', requireAdmin, auditLog, asyncHandler(createAdminSection));
router.patch('/dashboard-sections/reorder', requireAdmin, auditLog, asyncHandler(reorderAdminSections));
router.get('/dashboard-sections/:id', requireAdmin, asyncHandler(getAdminSectionById));
router.patch('/dashboard-sections/:id', requireAdmin, auditLog, asyncHandler(updateAdminSection));
router.delete('/dashboard-sections/:id', requireAdmin, auditLog, asyncHandler(deleteAdminSection));

// Section Items
router.post('/dashboard-sections/:id/items', requireAdmin, auditLog, asyncHandler(addAdminSectionItem));
router.patch('/dashboard-sections/:id/items/reorder', requireAdmin, auditLog, asyncHandler(reorderAdminSectionItems));
router.patch('/dashboard-sections/:id/items/:itemId', requireAdmin, auditLog, asyncHandler(updateAdminSectionItem));
router.delete('/dashboard-sections/:id/items/:itemId', requireAdmin, auditLog, asyncHandler(deleteAdminSectionItem));

router.get('/reports/sales', requireAdmin, asyncHandler(getSalesReport));
router.get('/reports/customers', requireAdmin, asyncHandler(getCustomersReport));
router.get('/reports/top-products', requireAdmin, asyncHandler(getTopProductsReport));

router.get('/orders', requireAdmin, asyncHandler(getAdminOrders));
router.get('/orders/:id', requireAdmin, asyncHandler(getAdminOrderById));
router.patch('/orders/:id/status', requireAdmin, auditLog, asyncHandler(updateOrderStatus));
router.patch('/orders/:id/payment', requireAdmin, auditLog, asyncHandler(updateOrderPayment));

// Settings
router.get('/settings', requireAdmin, asyncHandler(getSettings));
router.patch('/settings', requireAdmin, auditLog, asyncHandler(updateSettings));
router.get('/offers/active', requireAdmin, asyncHandler(getActiveOffer));
router.get('/offers', requireAdmin, asyncHandler(getAdminOffers));
router.post('/offers', requireAdmin, auditLog, asyncHandler(createOffer));
router.patch('/offers/:id', requireAdmin, auditLog, asyncHandler(updateOffer));
router.delete('/offers/:id', requireAdmin, auditLog, asyncHandler(deleteOffer));
router.get('/offers/:id/products', requireAdmin, asyncHandler(getOfferProducts));
router.post('/offers/:id/products', requireAdmin, auditLog, asyncHandler(addOfferProduct));
router.delete('/offers/:id/products/:productId', requireAdmin, auditLog, asyncHandler(removeOfferProduct));
router.patch('/offers/:id/products/reorder', requireAdmin, auditLog, asyncHandler(reorderOfferProducts));

// Audit
router.get('/audit', requireAdmin, asyncHandler(getAuditLogs));

// Notifications
router.get('/notifications', requireAdmin, asyncHandler(getAdminNotifications));
router.post('/notifications', requireAdmin, auditLog, asyncHandler(createAdminNotification));
router.get('/notifications/:id', requireAdmin, asyncHandler(getAdminNotificationById));
router.delete('/notifications/:id', requireAdmin, auditLog, asyncHandler(deleteAdminNotification));

module.exports = router;
