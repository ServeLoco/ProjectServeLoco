const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/authMiddleware');
const { getRealtimeStatus } = require('../realtime/socket');

const router = express.Router();

router.get('/health', requireAdmin, asyncHandler(async (_req, res) => {
  res.status(200).json(getRealtimeStatus());
}));

module.exports = router;
