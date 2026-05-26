const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { normalizeStoreType } = require('../utils/storeMode');
const config = require('../config/env');

const hasValue = (value) => value !== undefined && value !== null && value !== '';
const validateNonNegativeNumber = (value, message) => {
  if (!hasValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { code: 'VALIDATION_ERROR', message };
  }
  return null;
};

const attachSettingsImageUrls = async (settings) => {
  if (!settings) return settings;

  settings.upi_qr_image_url = null;
  settings.upiQrImageUrl = null;

  const imageId = settings.upi_qr_image_id;
  if (!imageId || !ObjectId.isValid(imageId)) {
    return settings;
  }

  const db = getDb();
  const image = await db.collection('images').findOne({ _id: new ObjectId(imageId) });
  const imageUrl = image?.url ||
    image?.imageUrl ||
    image?.image_url ||
    (image?.filename ? `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${image.filename}` : null);

  if (imageUrl) {
    settings.upi_qr_image_url = imageUrl;
    settings.upiQrImageUrl = imageUrl;
  }

  return settings;
};

const attachOfferImageUrls = async (offers) => {
  const rows = Array.isArray(offers) ? offers : [offers].filter(Boolean);
  const imageIds = rows
    .map(row => row.image_id)
    .filter(id => id && ObjectId.isValid(id))
    .map(id => new ObjectId(id));

  if (imageIds.length === 0) return offers;

  const db = getDb();
  const images = await db.collection('images').find({ _id: { $in: imageIds } }).toArray();
  const imageMap = {};
  images.forEach(image => {
    imageMap[image._id.toString()] = image.url;
  });

  rows.forEach(row => {
    if (row.image_id && imageMap[row.image_id]) {
      row.imageUrl = imageMap[row.image_id];
      row.image_url = imageMap[row.image_id];
    }
  });

  return offers;
};

const getSettings = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
  let settings = rows[0];

  if (!settings) {
    // Return safe fallback
    settings = {
      shop_open: 1,
      minimum_order_amount: 50,
      delivery_charge: 10,
      free_delivery_above: 500,
      night_charge: 0,
      support_phone: '',
      support_whatsapp: '',
      shop_latitude: null,
      shop_longitude: null,
      delivery_radius_km: 8.00,
      delivery_cost_per_km: 0.00,
      below_threshold_delivery_charge: 20.00,
      free_delivery_above_minimum_active: 1,
      free_delivery_offer_active: 0,
      upi_qr_image_id: null
    };
  }
  await attachSettingsImageUrls(settings);
  res.status(200).json({ data: settings });
};

const getActiveOffer = async (req, res) => {
  const { store_type, storeType } = req.query;
  const finalStoreType = store_type || storeType || 'packed';
  let query = 'SELECT * FROM offers WHERE active = 1 AND deleted = 0';
  const params = [];

  if (finalStoreType) {
    const normalizedStoreType = finalStoreType === 'all'
      ? 'packed'
      : normalizeStoreType(finalStoreType, { allowAll: false });
    query += ' AND store_type = ?';
    params.push(normalizedStoreType);
  }

  query += ' ORDER BY id DESC LIMIT 1';
  const [rows] = await pool.query(query, params);
  
  if (rows.length === 0) {
    return res.status(200).json({ data: null });
  }

  await attachOfferImageUrls(rows[0]);
  res.status(200).json({ data: rows[0] });
};

const updateSettings = async (req, res) => {
  const fields = [
    'shop_open', 'delivery_available', 'minimum_order_amount', 'delivery_charge',
    'free_delivery_above', 'night_charge', 'night_charge_start', 'night_charge_end',
    'whatsapp_number', 'upi_id', 'upi_qr_image_id', 'delivery_time_message',
    'shop_latitude', 'shop_longitude', 'delivery_radius_km', 'delivery_cost_per_km',
    'below_threshold_delivery_charge', 'free_delivery_above_minimum_active',
    'free_delivery_offer_active'
  ];

  const body = req.body;

  const moneyFields = [
    ['minimum_order_amount', 'Minimum order amount cannot be negative'],
    ['delivery_charge', 'Standard delivery charge cannot be negative'],
    ['free_delivery_above', 'Free delivery above amount cannot be negative'],
    ['night_charge', 'Night delivery surcharge cannot be negative'],
    ['below_threshold_delivery_charge', 'Below-threshold delivery charge cannot be negative']
  ];

  for (const [field, message] of moneyFields) {
    const error = validateNonNegativeNumber(body[field], message);
    if (error) return res.status(400).json(error);
  }

  // Validate coordinates when provided
  if (hasValue(body.shop_latitude)) {
    const lat = Number(body.shop_latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Latitude must be between -90 and 90' });
    }
  }
  if (hasValue(body.shop_longitude)) {
    const lng = Number(body.shop_longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Longitude must be between -180 and 180' });
    }
  }

  // Prevent negative values for delivery radius and per-km cost
  if (hasValue(body.delivery_radius_km)) {
    const radius = Number(body.delivery_radius_km);
    if (!Number.isFinite(radius) || radius < 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Delivery radius cannot be negative' });
    }
  }
  if (hasValue(body.delivery_cost_per_km)) {
    const cost = Number(body.delivery_cost_per_km);
    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Delivery cost per km cannot be negative' });
    }
  }

  const updates = [];
  const params = [];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      let val = body[field];
      if (['shop_open', 'delivery_available', 'free_delivery_offer_active', 'free_delivery_above_minimum_active'].includes(field)) {
        val = (val === true || val === 'true' || val === 1 || val === '1') ? 1 : 0;
      } else if ([
        'minimum_order_amount',
        'delivery_charge',
        'free_delivery_above',
        'night_charge',
        'shop_latitude',
        'shop_longitude',
        'delivery_radius_km',
        'delivery_cost_per_km',
        'below_threshold_delivery_charge'
      ].includes(field)) {
        val = (val === null || val === '') ? null : Number(val);
      }
      params.push(val);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid fields provided' });
  }

  const [rows] = await pool.query('SELECT id FROM settings LIMIT 1');
  let settingsId = rows[0]?.id;
  if (rows.length === 0) {
    const [insertResult] = await pool.query('INSERT INTO settings (shop_open) VALUES (1)');
    settingsId = insertResult?.insertId;
  }

  await pool.query(`UPDATE settings SET ${updates.join(', ')} WHERE id = ?`, [...params, settingsId]);
  const [updatedRows] = await pool.query('SELECT * FROM settings LIMIT 1');
  const updatedSettings = await attachSettingsImageUrls(updatedRows[0]);

  res.status(200).json({ message: 'Settings updated successfully', data: updatedSettings });
};

const createOffer = async (req, res) => {
  const { title, description, active, image_id, imageId, store_type, storeType } = req.body;
  const finalImageId = image_id || imageId || null;
  const finalStoreType = normalizeStoreType(store_type || storeType);

  if (!title) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Title is required' });
  }

  const isActive = (active === true || active === 'true' || active === 1) ? 1 : 0;

  const [result] = await pool.query(
    'INSERT INTO offers (title, description, active, image_id, store_type) VALUES (?, ?, ?, ?, ?)',
    [title, description || '', isActive, finalImageId, finalStoreType]
  );

  res.status(201).json({ message: 'Offer created', id: result.insertId });
};

const updateOffer = async (req, res) => {
  const { id } = req.params;
  const { title, description, active, image_id, imageId } = req.body;
  
  const updates = [];
  const params = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }

  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }

  if (active !== undefined) {
    updates.push('active = ?');
    params.push((active === true || active === 'true' || active === 1) ? 1 : 0);
  }

  const finalImageId = image_id || imageId;
  if (finalImageId !== undefined) {
    updates.push('image_id = ?');
    params.push(finalImageId);
  }

  const finalStoreTypeInput = req.body.store_type || req.body.storeType;
  if (finalStoreTypeInput !== undefined) {
    updates.push('store_type = ?');
    params.push(normalizeStoreType(finalStoreTypeInput));
  }

  if (updates.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid fields provided' });
  }

  params.push(id);
  await pool.query(`UPDATE offers SET ${updates.join(', ')} WHERE id = ?`, params);

  res.status(200).json({ message: 'Offer updated' });
};

const getAdminOffers = async (req, res) => {
  const { store_type, storeType } = req.query;
  const finalStoreType = store_type || storeType;
  let query = 'SELECT * FROM offers WHERE deleted = 0';
  const params = [];

  if (finalStoreType) {
    const normalizedStoreType = normalizeStoreType(finalStoreType, { allowAll: true });
    if (normalizedStoreType !== 'all') {
      query += ' AND store_type = ?';
      params.push(normalizedStoreType);
    }
  }

  query += ' ORDER BY id DESC';
  const [rows] = await pool.query(query, params);
  await attachOfferImageUrls(rows);
  res.status(200).json({ data: rows });
};

const deleteOffer = async (req, res) => {
  const { id } = req.params;
  await pool.query('UPDATE offers SET deleted = 1 WHERE id = ?', [id]);
  res.status(200).json({ message: 'Offer soft deleted' });
};

module.exports = {
  getSettings,
  getActiveOffer,
  updateSettings,
  createOffer,
  updateOffer,
  getAdminOffers,
  deleteOffer
};
