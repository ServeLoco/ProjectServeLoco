const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireCustomer } = require('../middleware/authMiddleware');
const {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
  deleteNotification,
  clearAllNotifications
} = require('../controllers/notificationController');

router.use(requireCustomer);

router.get('/', asyncHandler(getNotifications));
router.get('/unread-count', asyncHandler(getUnreadCount));
router.patch('/read-all', asyncHandler(markAllRead));
// Static path before /:id so "clear-all" is not treated as an id.
router.delete('/clear-all', asyncHandler(clearAllNotifications));
router.patch('/:id/read', asyncHandler(markRead));
router.delete('/:id', asyncHandler(deleteNotification));

module.exports = router;
