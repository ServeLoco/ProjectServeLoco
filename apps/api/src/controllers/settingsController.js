const { pool } = require('../db/mysql');
const { normalizeStoreType } = require('../utils/storeMode');
const { createTtlCache } = require('../utils/ttlCache');
const config = require('../config/env');
const { cleanupOrphanedImage } = require('./imageController');

// Settings is a singleton (1 row), read by every app open and every public
// endpoint. 60-second cache eliminates 99%+ of SELECTs in a 500-user app.
// Invalidated on PATCH.
const settingsCache = createTtlCache({ ttlMs: 60_000 });
const SETTINGS_KEY = 'settings';

const hasValue = (value) => value !== undefined && value !== null && value !== '';
const getStoredImageUrl = (image) => image?.url ||
  image?.imageUrl ||
  image?.image_url ||
  (image?.filename ? `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${image.filename}` : null);

const validateNonNegativeNumber = (value, message) => {
  if (!hasValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { code: 'VALIDATION_ERROR', message };
  }
  return null;
};

const MAX_DELIVERY_MINUTES = 24 * 60 - 1;
const validatePositiveInt = (value, fieldLabel) => {
  if (!hasValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_DELIVERY_MINUTES) {
    return {
      code: 'VALIDATION_ERROR',
      message: `${fieldLabel} must be a whole number between 1 and ${MAX_DELIVERY_MINUTES} minutes`,
    };
  }
  return null;
};

const attachSettingsImageUrls = async (settings) => {
  if (!settings) return settings;

  settings.upi_qr_image_url = null;
  settings.upiQrImageUrl = null;

  const imageId = settings.upi_qr_image_id;
  if (!imageId || !/^\d+$/.test(String(imageId))) {
    return settings;
  }

  const [imageRows] = await pool.query('SELECT id, url FROM images WHERE id = ?', [imageId]);
  const imageUrl = getStoredImageUrl(imageRows[0]);

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
    .filter(id => id && /^\d+$/.test(String(id)));

  if (imageIds.length === 0) return offers;

  const [images] = await pool.query('SELECT id, url FROM images WHERE id IN (?)', [imageIds]);
  const imageMap = {};
  images.forEach(image => {
    imageMap[String(image.id)] = getStoredImageUrl(image);
  });

  rows.forEach(row => {
    if (row.image_id && imageMap[row.image_id]) {
      row.imageUrl = imageMap[row.image_id];
      row.image_url = imageMap[row.image_id];
    }
    if (row.is_clickable !== undefined) {
      row.isClickable = Boolean(row.is_clickable);
      row.is_clickable = Boolean(row.is_clickable);
    }
  });

  return offers;
};

const attachOfferProductImageUrls = async (products) => {
  const rows = Array.isArray(products) ? products : [products].filter(Boolean);
  const imageIds = rows
    .map(row => row.image_id)
    .filter(id => id && /^\d+$/.test(String(id)));

  if (imageIds.length === 0) return products;

  const [images] = await pool.query('SELECT id, url FROM images WHERE id IN (?)', [imageIds]);
  const imageMap = {};
  images.forEach(image => {
    imageMap[String(image.id)] = getStoredImageUrl(image);
  });

  rows.forEach(row => {
    if (row.image_id && imageMap[row.image_id]) {
      row.imageUrl = imageMap[row.image_id];
      row.image_url = imageMap[row.image_id];
    }
  });

  return products;
};

const getSettings = async (req, res) => {
  const settings = await settingsCache.wrap(SETTINGS_KEY, async () => {
    const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
    const s = rows[0] || {
      shop_open: 1,
      minimum_order_amount: 50,
      delivery_charge: 10,
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
      upi_qr_image_id: null,
      minimum_version: null,
      current_version: null,
    };
    return attachSettingsImageUrls(s);
  });

  res.status(200).json({ data: settings });
};

const getActiveOffer = async (req, res) => {
  const { store_type, storeType } = req.query;
  const finalStoreType = store_type || storeType || 'packed';
  let query = 'SELECT * FROM offers WHERE active = 1 AND deleted = 0';
  const params = [];

  if (finalStoreType) {
    const normalizedStoreType = normalizeStoreType(finalStoreType, { allowAll: true });
    if (normalizedStoreType !== 'all') {
      query += ' AND store_type = ?';
      params.push(normalizedStoreType);
    }
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
    'night_charge', 'night_charge_start', 'night_charge_end',
    'whatsapp_number', 'support_phone', 'upi_id', 'upi_qr_image_id',
    'below_threshold_delivery_charge', 'free_delivery_above_minimum_active',
    'free_delivery_offer_active', 'fast_delivery_enabled', 'fast_delivery_charge',
    'standard_delivery_minutes', 'fast_delivery_minutes',
    'minimum_version',
    'current_version',
    // DEPRECATED (no longer used): free_delivery_above, shop_latitude, shop_longitude,
    // delivery_radius_km, delivery_cost_per_km
  ];

  const body = req.body;

  const moneyFields = [
    ['minimum_order_amount', 'Minimum order amount cannot be negative'],
    ['delivery_charge', 'Standard delivery charge cannot be negative'],
    ['night_charge', 'Night delivery surcharge cannot be negative'],
    ['below_threshold_delivery_charge', 'Below-threshold delivery charge cannot be negative'],
    ['fast_delivery_charge', 'Fast delivery charge cannot be negative']
  ];

  for (const [field, message] of moneyFields) {
    const error = validateNonNegativeNumber(body[field], message);
    if (error) return res.status(400).json(error);
  }

  const intFields = [
    ['standard_delivery_minutes', 'Standard delivery time'],
    ['fast_delivery_minutes', 'Fast delivery time'],
  ];
  for (const [field, label] of intFields) {
    const error = validatePositiveInt(body[field], label);
    if (error) return res.status(400).json(error);
  }

  // Validate night charge window requires an actual charge
  if (hasValue(body.night_charge_start) && hasValue(body.night_charge_end)) {
    const nightCharge = Number(body.night_charge);
    if (!Number.isFinite(nightCharge) || nightCharge <= 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Night delivery surcharge must be > 0 if start and end times are set' });
    }
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
        'night_charge',
        'below_threshold_delivery_charge'
        // DEPRECATED: free_delivery_above, shop_latitude, shop_longitude,
        // delivery_radius_km, delivery_cost_per_km — no longer stored
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
  settingsCache.del(SETTINGS_KEY);
  const [updatedRows] = await pool.query('SELECT * FROM settings LIMIT 1');
  const updatedSettings = await attachSettingsImageUrls(updatedRows[0]);

  res.status(200).json({ message: 'Settings updated successfully', data: updatedSettings });
};

const createOffer = async (req, res) => {
  const { title, description, active, image_id, imageId, store_type, storeType, is_clickable, isClickable } = req.body;
  const finalImageId = image_id || imageId || null;
  const finalStoreType = normalizeStoreType(store_type || storeType);
  const clickableInput = is_clickable !== undefined ? is_clickable : isClickable;
  const finalIsClickable = (clickableInput === true || clickableInput === 'true' || clickableInput === 1 || clickableInput === '1') ? 1 : 0;

  if (!title) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Title is required' });
  }

  const isActive = (active === true || active === 'true' || active === 1 || active === '1') ? 1 : 0;
  if (isActive && !finalImageId) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'An active offer must have an image.' });
  }

  const [result] = await pool.query(
    'INSERT INTO offers (title, description, active, image_id, store_type, is_clickable) VALUES (?, ?, ?, ?, ?, ?)',
    [title, description || '', isActive, finalImageId, finalStoreType, finalIsClickable]
  );

  res.status(201).json({ message: 'Offer created', id: result.insertId });
};

const updateOffer = async (req, res) => {
  const { id } = req.params;
  const { title, description, active, image_id, imageId, is_clickable, isClickable } = req.body;

  const [existingRows] = await pool.query('SELECT * FROM offers WHERE id = ? AND deleted = 0', [id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Offer not found' });
  }
  const existingOffer = existingRows[0];
  
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

  const clickableInput = is_clickable !== undefined ? is_clickable : isClickable;
  if (clickableInput !== undefined) {
    updates.push('is_clickable = ?');
    params.push((clickableInput === true || clickableInput === 'true' || clickableInput === 1 || clickableInput === '1') ? 1 : 0);
  }

  const finalImageId = image_id !== undefined ? image_id : (imageId !== undefined ? imageId : undefined);
  if (finalImageId !== undefined) {
    updates.push('image_id = ?');
    params.push(finalImageId);
  }

  const nextActive = active !== undefined
    ? (active === true || active === 'true' || active === 1 || active === '1')
    : (existingOffer.active === true || existingOffer.active === 1 || existingOffer.active === '1' || existingOffer.active === 'true');

  const nextImageId = finalImageId !== undefined ? finalImageId : existingOffer.image_id;
  if (nextActive && !nextImageId) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'An active offer must have an image.' });
  }

  if (active !== undefined) {
    updates.push('active = ?');
    params.push(nextActive ? 1 : 0);
  }

  const finalStoreTypeInput = req.body.store_type || req.body.storeType;
  const targetStoreType = finalStoreTypeInput !== undefined
    ? normalizeStoreType(finalStoreTypeInput)
    : existingOffer.store_type;
  if (finalStoreTypeInput !== undefined) {
    updates.push('store_type = ?');
    params.push(targetStoreType);
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
  const [rows] = await pool.query('SELECT id, image_id FROM offers WHERE id = ? AND deleted = 0', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Offer not found' });
  }
  await pool.query('UPDATE offers SET deleted = 1 WHERE id = ? AND deleted = 0', [id]);
  await cleanupOrphanedImage(rows[0].image_id);
  res.status(200).json({ message: 'Offer soft deleted' });
};


const getOfferProducts = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(`
    SELECT op.id as offer_product_id, op.offer_id, op.product_id, op.display_order as op_display_order, op.active as op_active,
           p.*, c.name as category_name, c.type as category_type
    FROM offer_products op
    JOIN products p ON op.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE op.offer_id = ?
    ORDER BY op.display_order ASC, p.display_order ASC, p.id ASC
  `, [id]);

  await attachOfferProductImageUrls(rows);

  res.status(200).json({ data: rows });
};

const addOfferProduct = async (req, res) => {
  const { id } = req.params;
  const { product_id, productId, display_order } = req.body;
  const finalProductId = product_id || productId;

  if (!finalProductId) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'product_id is required' });
  }

  const [offerRows] = await pool.query('SELECT store_type, deleted FROM offers WHERE id = ?', [id]);
  if (offerRows.length === 0 || offerRows[0].deleted) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Offer not found or deleted' });
  }

  const [productRows] = await pool.query(`
    SELECT p.id, p.deleted, p.available, p.is_combo, c.type as category_type 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.id = ?`, [finalProductId]);
  
  if (productRows.length === 0 || productRows[0].deleted) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found or deleted' });
  }

  const product = productRows[0];
  if (!product.available) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Product is unavailable' });
  }
  if (product.is_combo) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Combos cannot be added to offers directly yet' });
  }
  if (product.category_type !== offerRows[0].store_type) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Product store mode (${product.category_type}) does not match offer mode (${offerRows[0].store_type})` });
  }

  try {
    await pool.query(
      'INSERT INTO offer_products (offer_id, product_id, display_order) VALUES (?, ?, ?)',
      [id, finalProductId, display_order || 0]
    );
    res.status(201).json({ message: 'Product added to offer' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(200).json({ message: 'Product already attached' });
    } else {
      throw err;
    }
  }
};

const removeOfferProduct = async (req, res) => {
  const { id, productId } = req.params;
  await pool.query('DELETE FROM offer_products WHERE offer_id = ? AND product_id = ?', [id, productId]);
  res.status(200).json({ message: 'Product removed from offer' });
};

const reorderOfferProducts = async (req, res) => {
  const { id } = req.params;
  const { productIds } = req.body;
  
  if (!Array.isArray(productIds)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'productIds array is required' });
  }

  for (let i = 0; i < productIds.length; i++) {
    await pool.query('UPDATE offer_products SET display_order = ? WHERE offer_id = ? AND product_id = ?', [i, id, productIds[i]]);
  }

  res.status(200).json({ message: 'Products reordered' });
};

module.exports = {
  getSettings,
  getActiveOffer,
  updateSettings,
  createOffer,
  updateOffer,
  getAdminOffers,
  deleteOffer,
  getOfferProducts,
  addOfferProduct,
  removeOfferProduct,
  reorderOfferProducts
};
