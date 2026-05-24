const { pool } = require('../db/mysql');

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
      support_whatsapp: ''
    };
  }
  res.status(200).json({ data: settings });
};

const getActiveOffer = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM offers WHERE active = 1 AND deleted = 0 ORDER BY id DESC LIMIT 1');
  
  if (rows.length === 0) {
    return res.status(200).json({ data: null });
  }

  res.status(200).json({ data: rows[0] });
};

const updateSettings = async (req, res) => {
  const fields = [
    'shop_open', 'delivery_available', 'minimum_order_amount', 'delivery_charge',
    'free_delivery_above', 'night_charge', 'night_charge_start', 'night_charge_end',
    'whatsapp_number', 'upi_id', 'delivery_time_message'
  ];

  const body = req.body;
  const updates = [];
  const params = [];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      let val = body[field];
      if (['shop_open', 'delivery_available'].includes(field)) {
        val = (val === true || val === 'true' || val === 1) ? 1 : 0;
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
