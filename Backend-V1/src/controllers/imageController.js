const path = require('path');
const fs = require('fs');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db/mongodb');
const { pool } = require('../db/mysql');
const config = require('../config/env');

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
    url
  };
};

const uploadImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No image file provided' });
  }

  const { filename, originalname, mimetype, size } = req.file;
  const baseUrl = config.PUBLIC_BASE_URL;
  const staticPath = config.STATIC_UPLOAD_PATH;
  
  const url = `${baseUrl}${staticPath}/${filename}`;

  const imageDoc = {
    filename,
    originalName: originalname,
    mimeType: mimetype,
    size,
    storageType: 'disk',
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
      image_url: savedDoc.url
    },
    image: {
      ...savedDoc,
      id: idStr,
      imageUrl: savedDoc.url,
      image_url: savedDoc.url
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

  const db = getDb();
  const image = await db.collection('images').findOne({ _id: new ObjectId(id) });
  
  if (!image) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Image not found' });
  }

  // Delete from disk if storage is disk
  if (image.storageType === 'disk') {
    const filePath = path.join(__dirname, '../../', config.UPLOAD_DIR, image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  await db.collection('images').deleteOne({ _id: new ObjectId(id) });

  res.status(200).json({ message: 'Image deleted successfully' });
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
  getImage
};
