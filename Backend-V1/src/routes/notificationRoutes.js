const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireCustomer } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  deleteNotification
} = require('../controllers/notificationController');

router.use(requireCustomer);

router.get('/', asyncHandler(getNotifications));
router.get('/unread-count', asyncHandler(getUnreadCount));
router.patch('/read-all', asyncHandler(markAllRead));
router.patch('/:id/read', asyncHandler(markRead));
router.delete('/:id', asyncHandler(deleteNotification));

module.exports = router;
