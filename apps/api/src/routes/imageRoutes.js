const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

const checkMagicBytes = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(12);
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);
  
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'webp';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'gif';
  return null;
};

// Admin-only upload wrapper handling Multer errors cleanly and verifying magic bytes
const uploadMiddleware = (req, res, next) => {
  const uploader = upload.single('image');
  uploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
    } else if (err) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: err.message });
    }

    if (req.file) {
      const ext = checkMagicBytes(req.file.path);
      if (!ext) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid image format detected' });
      }
      
      const newPath = req.file.path.substring(0, req.file.path.lastIndexOf('.')) + '.' + ext;
      if (req.file.path !== newPath) {
        fs.renameSync(req.file.path, newPath);
        req.file.path = newPath;
        req.file.filename = req.file.filename.substring(0, req.file.filename.lastIndexOf('.')) + '.' + ext;
      }
    }
    next();
  });
};

router.get('/:id', asyncHandler(getImage));
router.get('/', requireAdmin, asyncHandler(getImages));
router.post('/', requireAdmin, uploadLimiter, uploadMiddleware, asyncHandler(uploadImage));
router.delete('/:id', requireAdmin, asyncHandler(deleteImage));

module.exports = router;
