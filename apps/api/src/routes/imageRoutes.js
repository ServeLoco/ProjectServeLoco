const express = require('express');
const router = express.Router();
const multer = require('multer');
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/authMiddleware');
const { uploadImage, deleteImage, getImages, getImage } = require('../controllers/imageController');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // max 20 images per hour
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many uploads, please try again later.' }
});

// Keep the file in memory so the same buffer works for both storage backends
// (disk in dev, S3 in prod). No file touches disk until the controller decides.
const storage = multer.memoryStorage();

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

// Verify the real file type from its leading bytes, defeating extension/MIME spoofing.
const checkMagicBytes = (buffer) => {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'webp';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'gif';
  return null;
};

// Admin-only upload wrapper: handles Multer errors and verifies magic bytes on the
// in-memory buffer. Attaches the detected extension for the controller to use.
const uploadMiddleware = (req, res, next) => {
  const uploader = upload.single('image');
  uploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
    } else if (err) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
    }

    if (req.file) {
      const ext = checkMagicBytes(req.file.buffer);
      if (!ext) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid image format detected' });
      }
      req.file.detectedExt = ext;
    }
    next();
  });
};

// Public: product photos and the UPI QR image are fetched by id from the
// customer app (imagesApi.getImage) with no admin token. Locking this down
// broke UPI checkout — see plans/analytics.md audit.
router.get('/:id', asyncHandler(getImage));
router.get('/', requireAdmin, asyncHandler(getImages));
router.post('/', requireAdmin, uploadLimiter, uploadMiddleware, asyncHandler(uploadImage));
router.delete('/:id', requireAdmin, asyncHandler(deleteImage));

module.exports = router;
