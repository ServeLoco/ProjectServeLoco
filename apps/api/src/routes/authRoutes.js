const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { me, updateProfile, requestAccountDeletion, cancelAccountDeletion, registerPushToken, logout, verifyFirebaseToken } = require('../controllers/authController');
const { requireCustomer } = require('../middleware/authMiddleware');
const { validate, isString, normalizeField } = require('../validators');
const rateLimit = require('express-rate-limit');

// Each auth flow gets its OWN limiter instance so they have independent
// per-IP buckets. A factory keeps the window/max consistent.
const makeAuthLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many auth requests, please try again later.' }
});

const deleteAccountLimiter = makeAuthLimiter();
const firebaseVerifyLimiter = makeAuthLimiter();

// Schemas
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

// Routes
// Firebase Phone Auth — client sends Firebase ID token after OTP verification.
// Works for both login (existing user) and signup (new user, include name).
router.post('/firebase-verify', firebaseVerifyLimiter, asyncHandler(verifyFirebaseToken));

router.get('/me', requireCustomer, asyncHandler(me));
router.put('/profile', requireCustomer, validate(profileSchema), asyncHandler(updateProfile));
router.patch('/profile', requireCustomer, validate(profileSchema), asyncHandler(updateProfile)); // PATCH alias
// Soft-delete with a 30-day grace period — see authController.requestAccountDeletion.
router.post('/me/request-deletion', deleteAccountLimiter, requireCustomer, asyncHandler(requestAccountDeletion));
router.post('/me/cancel-deletion', deleteAccountLimiter, requireCustomer, asyncHandler(cancelAccountDeletion));
// Register / refresh Expo push token. Called by the app on every login and startup.
router.post('/me/push-token', requireCustomer, asyncHandler(registerPushToken));
// Logout — clears this user's push token server-side so a shared device stops
// receiving their notifications. Client discards the JWT afterwards.
router.post('/logout', requireCustomer, asyncHandler(logout));

module.exports = router;
