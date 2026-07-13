const express = require('express');
const { requireCustomer } = require('../middleware/authMiddleware');
const { requireRider } = require('../middleware/riderMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const {
  getMe,
  setOnline,
  heartbeat,
  updateLocation,
  getActiveOffer,
  acceptOfferHttp,
  rejectOfferHttp,
  getCurrentAssignment,
  getAssignmentHistory,
  cancelAssignmentHttp,
  markPickedUp,
  updateAssignmentStatus,
} = require('../controllers/riderController');

const router = express.Router();

// Every rider route requires a valid customer JWT AND an active riders row.
// Capability is DB-derived (same pattern as shop-owner routes).
router.use(requireCustomer);
router.use(asyncHandler(requireRider));

router.get('/me', asyncHandler(getMe));
router.patch('/me/online', asyncHandler(setOnline));
router.post('/me/heartbeat', asyncHandler(heartbeat));
router.post('/me/location', asyncHandler(updateLocation));

router.get('/offers/active', asyncHandler(getActiveOffer));
router.post('/offers/:offerId/accept', asyncHandler(acceptOfferHttp));
router.post('/offers/:offerId/reject', asyncHandler(rejectOfferHttp));

router.get('/assignments/current', asyncHandler(getCurrentAssignment));
router.get('/assignments/history', asyncHandler(getAssignmentHistory));
router.post('/assignments/:orderId/cancel', asyncHandler(cancelAssignmentHttp));
router.post('/assignments/:orderId/picked-up', asyncHandler(markPickedUp));
router.patch('/assignments/:orderId/status', asyncHandler(updateAssignmentStatus));

module.exports = router;
