const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { register, login, me, updateProfile, requestPasswordReset, deleteAccount } = require('../controllers/authController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isString, isPhone, normalizeField } = require('../validators');
const rateLimit = require('express-rate-limit');

// Each auth flow gets its OWN limiter instance so they have independent
// per-IP buckets. A factory keeps the window/max consistent. Previously a
// single shared instance meant 10 failed logins also locked the user out of
// signup and password-reset for 15 minutes (one bucket for all auth routes).
const makeAuthLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many auth requests, please try again later.' }
});

const loginLimiter = makeAuthLimiter();
const registerLimiter = makeAuthLimiter(); // shared by /register and its /signup alias (same flow)
const passwordResetLimiter = makeAuthLimiter();
const deleteAccountLimiter = makeAuthLimiter();

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
  if (!isString(data.password)) {
    errors.password = 'Password is required';
  } else if (String(data.password).length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }

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
    whatsapp_number: normalizeField(req, 'whatsappNumber', 'whatsapp_number') ?? normalizeField(req, 'whatsapp', 'whatsapp')
  };

  if (!isString(data.name)) errors.name = 'Name is required';
  // address and whatsapp_number are optional updates

  return { errors, data };
};

const passwordResetRequestSchema = (req) => {
  const errors = {};
  const data = {
    phone: normalizeField(req, 'phone', 'phone'),
    newPassword: normalizeField(req, 'newPassword', 'new_password')
  };

  if (!isPhone(data.phone)) errors.phone = 'Valid phone number is required';
  if (!isString(data.newPassword) || String(data.newPassword).length < 8) {
    errors.newPassword = 'New password must be at least 8 characters';
  }

  return { errors, data };
};

// Routes
router.post('/register', registerLimiter, validate(registerSchema), asyncHandler(register));
router.post('/signup', registerLimiter, validate(registerSchema), asyncHandler(register)); // alias for frontend (shares register bucket)
router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));
router.post('/password-reset-requests', passwordResetLimiter, validate(passwordResetRequestSchema), asyncHandler(requestPasswordReset));
router.get('/me', requireCustomer, asyncHandler(me));
router.put('/profile', requireCustomer, validate(profileSchema), asyncHandler(updateProfile));
router.patch('/profile', requireCustomer, validate(profileSchema), asyncHandler(updateProfile)); // PATCH alias
router.delete('/me', deleteAccountLimiter, requireCustomer, asyncHandler(deleteAccount));

module.exports = router;
