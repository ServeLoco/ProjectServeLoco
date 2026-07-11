const express = require('express');
const { requireCustomer } = require('../middleware/authMiddleware');
const { requireRider } = require('../middleware/riderMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { getMe, setOnline, heartbeat } = require('../controllers/riderController');

const router = express.Router();

// Every rider route requires a valid customer JWT AND an active riders row.
// Capability is DB-derived (same pattern as shop-owner routes).
router.use(requireCustomer);
router.use(asyncHandler(requireRider));

router.get('/me', asyncHandler(getMe));
router.patch('/me/online', asyncHandler(setOnline));
router.post('/me/heartbeat', asyncHandler(heartbeat));

module.exports = router;
