const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/authMiddleware');
const { uploadImage, deleteImage, getImages } = require('../controllers/imageController');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // max 20 images per hour
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many uploads, please try again later.' }
});

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../', config.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(config.MAX_IMAGE_SIZE_MB) * 1024 * 1024 }
});

// Admin-only upload wrapper handling Multer errors cleanly
const uploadMiddleware = (req, res, next) => {
  const uploader = upload.single('image');
  uploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
    } else if (err) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
    }
    next();
  });
};

router.get('/', requireAdmin, asyncHandler(getImages));
router.post('/', requireAdmin, uploadLimiter, uploadMiddleware, asyncHandler(uploadImage));
router.delete('/:id', requireAdmin, asyncHandler(deleteImage));

module.exports = router;
