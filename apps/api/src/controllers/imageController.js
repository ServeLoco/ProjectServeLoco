const path = require('path');
const fs = require('fs');
const { pool } = require('../db/mysql');
const config = require('../config/env');
const s3 = require('../config/s3');
const { generateThumb, thumbFilenameFor } = require('../utils/imageThumbs');

const MIME_MAP = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// Resolve the absolute disk upload directory, creating it on first use (dev/disk mode).
const uploadDir = path.join(__dirname, '../../', config.UPLOAD_DIR);
const ensureUploadDir = () => {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
};

// Build a unique, collision-safe filename using the magic-byte-detected extension.
const buildFilename = (fieldname, ext) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return `${fieldname}-${uniqueSuffix}.${ext}`;
};

const getUsedImageIds = async () => {
  const [products] = await pool.query('SELECT DISTINCT image_id FROM products WHERE image_id IS NOT NULL AND deleted = 0');
  const [categories] = await pool.query('SELECT DISTINCT image_id FROM categories WHERE image_id IS NOT NULL AND deleted = 0');
  const [combos] = await pool.query('SELECT DISTINCT image_id FROM combos WHERE image_id IS NOT NULL AND deleted = 0');
  const [offers] = await pool.query('SELECT DISTINCT image_id FROM offers WHERE image_id IS NOT NULL AND deleted = 0');
  const [settings] = await pool.query('SELECT upi_qr_image_id FROM settings WHERE upi_qr_image_id IS NOT NULL LIMIT 1');

  const used = new Set();
  const usageMap = {};

  const addUsage = (rows, type, field = 'image_id') => {
    for (const r of rows) {
      const id = String(r[field]);
      used.add(id);
      if (!usageMap[id]) usageMap[id] = [];
      if (!usageMap[id].includes(type)) usageMap[id].push(type);
    }
  };

  addUsage(products, 'Product');
  addUsage(categories, 'Category');
  addUsage(combos, 'Combo');
  addUsage(offers, 'Offer');
  addUsage(settings, 'Settings', 'upi_qr_image_id');

  return { used, usageMap };
};

const getImageUrl = (image) => {
  if (!image) return null;
  return image.url ||
    (image.filename ? `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${image.filename}` : null);
};

const normalizeImage = (row) => {
  if (!row) return row;
  const url = getImageUrl(row);
  const thumbUrl = row.thumb_url || null;

  return {
    id: String(row.id),
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    storageType: row.storage_type,
    altText: row.alt_text,
    imageUrl: url,
    image_url: url,
    url,
    thumbUrl,
    thumb_url: thumbUrl,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
};

/**
 * Best-effort thumb generation. Never throws — returns null on failure.
 * @returns {Promise<{ thumbFilename: string, thumbUrl: string }|null>}
 */
const storeThumb = async (buffer, originalFilename, ext, storageType) => {
  try {
    const thumb = await generateThumb(buffer, ext);
    if (!thumb) return null;
    const thumbFilename = thumbFilenameFor(originalFilename, thumb.ext);
    let thumbUrl;
    if (storageType === 's3') {
      thumbUrl = await s3.uploadBuffer(thumbFilename, thumb.buffer, thumb.mimeType);
    } else {
      ensureUploadDir();
      fs.writeFileSync(path.join(uploadDir, thumbFilename), thumb.buffer);
      thumbUrl = `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${thumbFilename}`;
    }
    return { thumbFilename, thumbUrl };
  } catch (err) {
    console.error('[images] thumb generation failed:', err.message);
    return null;
  }
};

const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No image file provided' });
  }

  const { buffer, originalname, detectedExt } = req.file;
  const ext = detectedExt || (path.extname(originalname || '').replace('.', '') || 'jpg');
  const mimetype = MIME_MAP[ext] || req.file.mimetype || 'image/jpeg';
  const size = buffer.length;
  const filename = buildFilename('image', ext);
  const safeOriginalName = path.basename(originalname || filename).replace(/[^a-zA-Z0-9._-]/g, '');

  // Write to the configured backend and compute the public URL.
  let url;
  let storageType;
  if (config.STORAGE_DRIVER === 's3') {
    url = await s3.uploadBuffer(filename, buffer, mimetype);
    storageType = 's3';
  } else {
    ensureUploadDir();
    fs.writeFileSync(path.join(uploadDir, filename), buffer);
    url = `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${filename}`;
    storageType = 'disk';
  }

  // Thumbnail is best-effort — upload must succeed even if thumb fails.
  const thumbMeta = await storeThumb(buffer, filename, ext, storageType);
  const thumbUrl = thumbMeta?.thumbUrl || null;

  const altText = req.body.altText || '';

  const [result] = await pool.query(
    `INSERT INTO images (filename, original_name, mime_type, size, storage_type, url, alt_text, thumb_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [filename, safeOriginalName, mimetype, size, storageType, url, altText, thumbUrl]
  );
  const [savedRows] = await pool.query('SELECT * FROM images WHERE id = ?', [result.insertId]);
  const normalized = normalizeImage(savedRows[0]);

  res.status(201).json({
    message: 'Image uploaded successfully',
    data: normalized,
    image: normalized
  });
};

const isValidImageId = (id) => /^\d+$/.test(String(id));

const deleteImage = async (req, res) => {
  const { id } = req.params;

  if (!isValidImageId(id)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid image ID' });
  }

  const { used, usageMap } = await getUsedImageIds();
  if (used.has(id)) {
    const usages = usageMap[id].join(', ');
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Cannot delete image in use by: ${usages}` });
  }

  await deleteImageDocAndFile(id);
  res.status(200).json({ message: 'Image deleted successfully' });
};

// Internal: removes the MySQL row + underlying S3/disk object for a single image.
// Throws if the row or object removal fails.
const deleteImageDocAndFile = async (id) => {
  if (!isValidImageId(id)) return;

  const [rows] = await pool.query('SELECT * FROM images WHERE id = ?', [id]);
  const image = rows[0];
  if (!image) return;

  if (image.storage_type === 's3') {
    await s3.deleteObject(image.filename);
    // Best-effort delete of companion thumb (filename pattern or URL path).
    if (image.thumb_url) {
      try {
        const thumbKey = path.basename(String(image.thumb_url).split('?')[0]);
        if (thumbKey) await s3.deleteObject(thumbKey);
      } catch (_) { /* ignore */ }
    }
  } else if (image.storage_type === 'disk') {
    const filePath = path.join(__dirname, '../../', config.UPLOAD_DIR, image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (image.thumb_url) {
      try {
        const thumbKey = path.basename(String(image.thumb_url).split('?')[0]);
        const thumbPath = path.join(__dirname, '../../', config.UPLOAD_DIR, thumbKey);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      } catch (_) { /* ignore */ }
    }
  }

  await pool.query('DELETE FROM images WHERE id = ?', [id]);
};

// Public helper for other controllers: after soft-deleting an entity that
// references an image, call this with the imageId. If no active product /
// category / combo / offer / settings row still references it, the underlying
// file and MySQL row are removed. Errors are swallowed (and logged) so the
// parent delete response isn't blocked by image-storage failures.
const cleanupOrphanedImage = async (imageId) => {
  if (!imageId) return { deleted: false, reason: 'no-image-id' };
  const idStr = String(imageId);
  if (!isValidImageId(idStr)) return { deleted: false, reason: 'invalid-id' };

  try {
    const { used } = await getUsedImageIds();
    if (used.has(idStr)) {
      return { deleted: false, reason: 'still-in-use' };
    }
    await deleteImageDocAndFile(idStr);
    return { deleted: true };
  } catch (e) {
    console.error('[images] cleanupOrphanedImage failed for', idStr, e.message);
    return { deleted: false, reason: 'error', error: e.message };
  }
};

const getImages = async (req, res) => {
  const [images] = await pool.query('SELECT * FROM images ORDER BY created_at DESC');
  const { used, usageMap } = await getUsedImageIds();

  const normalizedImages = images.map(img => {
    const norm = normalizeImage(img);
    norm.in_use = used.has(norm.id);
    norm.usage = usageMap[norm.id] || [];
    return norm;
  });
  res.status(200).json({ data: normalizedImages });
};

const getImage = async (req, res) => {
  const { id } = req.params;

  if (!isValidImageId(id)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid image ID' });
  }

  const [rows] = await pool.query('SELECT * FROM images WHERE id = ?', [id]);
  const image = rows[0];

  if (!image) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Image not found' });
  }

  res.status(200).json({ data: normalizeImage(image) });
};

module.exports = {
  uploadImage,
  deleteImage,
  getImages,
  getImage,
  cleanupOrphanedImage
};
