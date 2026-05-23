const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getProducts, getProductById } = require('../controllers/productController');

router.get('/', asyncHandler(getProducts));
router.get('/:id', asyncHandler(getProductById));

module.exports = router;
