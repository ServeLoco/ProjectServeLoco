const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { login, me, getUsers, setBlockStatus, setTrustStatus } = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/authMiddleware');
const { validate, isString, isId, isBoolean, validatePagination, normalizeField } = require('../validators');
const rateLimit = require('express-rate-limit');

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

  // Normalize boolean
  data.trusted = data.trusted === true || data.trusted === 'true' || data.trusted === 1;

  return { errors, data };
};

// Routes
router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', requireAdmin, me);
router.get('/users', requireAdmin, validate(paginationSchema), asyncHandler(getUsers));
router.put('/users/:id/block', requireAdmin, validate(blockSchema), asyncHandler(setBlockStatus));
router.put('/users/:id/trust', requireAdmin, validate(trustSchema), asyncHandler(setTrustStatus));

module.exports = router;
