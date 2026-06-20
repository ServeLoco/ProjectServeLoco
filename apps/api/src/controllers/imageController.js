const path = require('path');
const fs = require('fs');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db/mongodb');
const { pool } = require('../db/mysql');
const config = require('../config/env');
const s3 = require('../config/s3');

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
    image.imageUrl ||
    image.image_url ||
    (image.filename ? `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${image.filename}` : null);
};

const normalizeImage = (image) => {
  const url = getImageUrl(image);
  const id = image._id.toString();

  return {
    ...image,
    id,
    imageUrl: url,
    image_url: url,
    url,
    created_at: image.created_at || image.createdAt || null,
    updated_at: image.updated_at || image.updatedAt || null
  };
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

  const imageDoc = {
    filename,
    originalName: safeOriginalName,
    mimeType: mimetype,
    size,
    storageType,
    url,
    altText: req.body.altText || '',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const db = getDb();
  const result = await db.collection('images').insertOne(imageDoc);
  const savedDoc = await db.collection('images').findOne?.({ _id: result.insertedId }) || {
    ...imageDoc,
    _id: result.insertedId
  };
  const idStr = savedDoc._id.toString();

  res.status(201).json({
    message: 'Image uploaded successfully',
    data: {
      ...savedDoc,
      id: idStr,
      imageUrl: savedDoc.url,
      image_url: savedDoc.url,
      created_at: savedDoc.created_at || savedDoc.createdAt || null,
      updated_at: savedDoc.updated_at || savedDoc.updatedAt || null
    },
    image: {
      ...savedDoc,
      id: idStr,
      imageUrl: savedDoc.url,
      image_url: savedDoc.url,
      created_at: savedDoc.created_at || savedDoc.createdAt || null,
      updated_at: savedDoc.updated_at || savedDoc.updatedAt || null
    }
  });
};

const deleteImage = async (req, res) => {
  const { id } = req.params;
  
  if (!ObjectId.isValid(id)) {
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

// Internal: removes the MongoDB doc + underlying S3/disk object for a single image.
// Throws if the doc or object removal fails.
const deleteImageDocAndFile = async (id) => {
  if (!ObjectId.isValid(id)) return;

  const db = getDb();
  const image = await db.collection('images').findOne({ _id: new ObjectId(id) });
  if (!image) return;

  if (image.storageType === 's3') {
    await s3.deleteObject(image.filename);
  } else if (image.storageType === 'disk') {
    const filePath = path.join(__dirname, '../../', config.UPLOAD_DIR, image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  await db.collection('images').deleteOne({ _id: new ObjectId(id) });
};

// Public helper for other controllers: after soft-deleting an entity that
// references an image, call this with the imageId. If no active product /
// category / combo / offer / settings row still references it, the underlying
// file and MongoDB doc are removed. Errors are swallowed (and logged) so the
// parent delete response isn't blocked by image-storage failures.
const cleanupOrphanedImage = async (imageId) => {
  if (!imageId) return { deleted: false, reason: 'no-image-id' };
  const idStr = String(imageId);
  if (!ObjectId.isValid(idStr)) return { deleted: false, reason: 'invalid-id' };

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
  const db = getDb();
  const images = await db.collection('images').find().sort({ createdAt: -1 }).toArray();
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

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid image ID' });
  }

  const db = getDb();
  const image = await db.collection('images').findOne({ _id: new ObjectId(id) });

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
