const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');

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
      free_delivery_offer_active: 0
    };
  }
  res.status(200).json({ data: settings });
};

const getActiveOffer = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM offers WHERE active = 1 AND deleted = 0 ORDER BY id DESC LIMIT 1');
  
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
    'free_delivery_offer_active'
  ];

  const body = req.body;

  // Validate coordinates when provided
  if (body.shop_latitude !== undefined && body.shop_latitude !== null && body.shop_latitude !== '') {
    const lat = Number(body.shop_latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Latitude must be between -90 and 90' });
    }
  }
  if (body.shop_longitude !== undefined && body.shop_longitude !== null && body.shop_longitude !== '') {
    const lng = Number(body.shop_longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Longitude must be between -180 and 180' });
    }
  }

  // Prevent negative values for delivery radius and per-km cost
  if (body.delivery_radius_km !== undefined && body.delivery_radius_km !== null && body.delivery_radius_km !== '') {
    const radius = Number(body.delivery_radius_km);
    if (isNaN(radius) || radius < 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Delivery radius cannot be negative' });
    }
  }
  if (body.delivery_cost_per_km !== undefined && body.delivery_cost_per_km !== null && body.delivery_cost_per_km !== '') {
    const cost = Number(body.delivery_cost_per_km);
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Delivery cost per km cannot be negative' });
    }
  }

  const updates = [];
  const params = [];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      let val = body[field];
      if (['shop_open', 'delivery_available', 'free_delivery_offer_active'].includes(field)) {
        val = (val === true || val === 'true' || val === 1) ? 1 : 0;
      } else if (['shop_latitude', 'shop_longitude', 'delivery_radius_km', 'delivery_cost_per_km'].includes(field)) {
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

  res.status(200).json({ message: 'Settings updated successfully', data: updatedRows[0] });
};

const createOffer = async (req, res) => {
  const { title, description, active, image_id, imageId } = req.body;
  const finalImageId = image_id || imageId || null;

  if (!title) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Title is required' });
  }

  const isActive = (active === true || active === 'true' || active === 1) ? 1 : 0;

  const [result] = await pool.query(
    'INSERT INTO offers (title, description, active, image_id) VALUES (?, ?, ?, ?)',
    [title, description || '', isActive, finalImageId]
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

  if (updates.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid fields provided' });
  }

  params.push(id);
  await pool.query(`UPDATE offers SET ${updates.join(', ')} WHERE id = ?`, params);

  res.status(200).json({ message: 'Offer updated' });
};

const getAdminOffers = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM offers WHERE deleted = 0 ORDER BY id DESC');
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
