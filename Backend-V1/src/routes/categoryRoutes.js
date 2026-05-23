const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { getCategories } = require('../controllers/categoryController');

router.get('/', asyncHandler(getCategories));

module.exports = router;
