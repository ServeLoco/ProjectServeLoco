const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { register, login, me, updateProfile } = require('../controllers/authController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isString, isPhone, normalizeField } = require('../validators');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many auth requests, please try again later.' }
});

// Schemas
const registerSchema = (req) => {
  const errors = {};
  const data = {
    name: normalizeField(req, 'name', 'name'),
    phone: normalizeField(req, 'phone', 'phone'),
    password: normalizeField(req, 'password', 'password'),
    address: normalizeField(req, 'address', 'address'),
    whatsapp_number: normalizeField(req, 'whatsappNumber', 'whatsapp_number')
  };

  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isPhone(data.phone)) errors.phone = 'Valid phone number is required';
  if (!isString(data.password)) errors.password = 'Password is required';

  return { errors, data };
};

const loginSchema = (req) => {
  const errors = {};
  const data = {
    phone: normalizeField(req, 'phone', 'phone'),
    password: normalizeField(req, 'password', 'password')
  };

  if (!isPhone(data.phone)) errors.phone = 'Valid phone number is required';
  if (!isString(data.password)) errors.password = 'Password is required';

  return { errors, data };
};

const profileSchema = (req) => {
  const errors = {};
  const data = {
    name: normalizeField(req, 'name', 'name'),
    address: normalizeField(req, 'address', 'address'),
    whatsapp_number: normalizeField(req, 'whatsappNumber', 'whatsapp_number')
  };

  if (!isString(data.name)) errors.name = 'Name is required';
  if (!isString(data.address)) errors.address = 'Address is required';

  return { errors, data };
};

// Routes
router.post('/register', authLimiter, validate(registerSchema), asyncHandler(register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(login));
router.get('/me', requireCustomer, asyncHandler(me));
router.put('/profile', requireCustomer, validate(profileSchema), asyncHandler(updateProfile));

module.exports = router;
