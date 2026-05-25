const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const resolveImageUrls = async (rows) => {
  const imageIds = rows
    .map(r => r.image_id)
    .filter(id => id && ObjectId.isValid(id))
    .map(id => new ObjectId(id));

  if (imageIds.length === 0) return;

  const db = getDb();
  const images = await db.collection('images').find({ _id: { $in: imageIds } }).toArray();
  const imageMap = {};
  images.forEach(img => { imageMap[img._id.toString()] = img.url; });
  rows.forEach(row => {
    if (row.image_id && imageMap[row.image_id]) {
      row.imageUrl = imageMap[row.image_id];
      row.image_url = imageMap[row.image_id];
    }
  });
};

const getComboItemsByComboIds = async (comboIds = []) => {
  const ids = comboIds.filter(Boolean);
  if (ids.length === 0) return {};

  const [rows] = await pool.query(
    `SELECT
      ci.combo_id,
      ci.product_id,
      ci.quantity,
      ci.display_order,
      p.id,
      p.name,
      p.price,
      p.unit,
      p.description,
      p.image_id,
      p.available,
      p.is_combo,
      p.featured,
      p.original_price,
      p.discount_label,
      p.category_id,
      c.name as category_name,
      c.type as category_type
    FROM combo_items ci
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ci.combo_id IN (?) AND p.deleted = 0
    ORDER BY ci.combo_id ASC, ci.display_order ASC, ci.id ASC`,
    [ids]
  );

  await resolveImageUrls(rows);

  return rows.reduce((map, row) => {
    const comboId = row.combo_id;
    if (!map[comboId]) map[comboId] = [];
    map[comboId].push({
      ...row,
      productId: row.product_id,
      product_id: row.product_id,
      quantity: Number(row.quantity) || 1,
    });
    return map;
  }, {});
};

const attachComboItems = async (combos = []) => {
  const comboIds = combos.map(combo => combo.id);
  const comboItemsMap = await getComboItemsByComboIds(comboIds);

  combos.forEach(combo => {
    const comboItems = comboItemsMap[combo.id] || [];
    combo.combo_items = comboItems;
    combo.comboItems = comboItems;
    combo.combo_count = comboItems.length;
  });
};

const saveComboItems = async (comboId, comboItems, connection = pool) => {
  if (!Array.isArray(comboItems)) return;

  await connection.query('DELETE FROM combo_items WHERE combo_id = ?', [comboId]);

  const rows = comboItems
    .map((item, index) => ({
      product_id: Number(item.product_id || item.productId || item.id),
      quantity: Number(item.quantity || item.qty || 1),
      display_order: Number(item.display_order || item.displayOrder || index),
    }))
    .filter(item => item.product_id && item.quantity > 0);

  if (rows.length === 0) return;

  await connection.query(
    `INSERT INTO combo_items (combo_id, product_id, quantity, display_order)
     VALUES ?`,
    [rows.map(item => [comboId, item.product_id, item.quantity, item.display_order])]
  );
};

const getAdminCombos = async (req, res) => {
  const { search, available, featured } = req.query;
  let query = "SELECT * FROM combos WHERE deleted = 0";
  const params = [];

  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  if (available !== undefined) {
    query += ' AND available = ?';
    params.push(available === 'true' || available === '1' ? 1 : 0);
  }

  if (featured !== undefined) {
    query += ' AND featured = ?';
    params.push(featured === 'true' || featured === '1' ? 1 : 0);
  }

  query += ' ORDER BY display_order ASC, id DESC';

  const [rows] = await pool.query(query, params);

  await resolveImageUrls(rows);
  await attachComboItems(rows);

  res.status(200).json({ data: { products: rows }, products: rows });
};

const getAdminComboById = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(`
    SELECT * 
    FROM combos 
    WHERE id = ? AND deleted = 0
  `, [id]);
  
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Combo not found' });
  }

  const combo = rows[0];
  await resolveImageUrls([combo]);
  await attachComboItems([combo]);

  res.status(200).json({ data: combo });
};

const createCombo = async (req, res) => {
  const { name, price, unit, description, image_id, available, featured, display_order, original_price, discount_label, combo_items } = req.validatedData;
  const finalDisplayOrder = display_order !== undefined ? display_order : 0;

  if (finalDisplayOrder > 0) {
    const [existing] = await pool.query('SELECT name FROM combos WHERE display_order = ? AND deleted = 0 LIMIT 1', [finalDisplayOrder]);
    if (existing.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by ${existing[0].name}.` });
    }
  }

  const [result] = await pool.query(
    'INSERT INTO combos (name, price, unit, description, image_id, available, featured, display_order, original_price, discount_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      name, price, unit, description, image_id, 
      available !== undefined ? available : true,
      featured !== undefined ? featured : false,
      finalDisplayOrder,
      original_price || null,
      discount_label || null
    ]
  );
  await saveComboItems(result.insertId, combo_items);
  res.status(201).json({ message: 'Combo created', id: result.insertId });
};

const updateCombo = async (req, res) => {
  const { id } = req.params;
  const { name, price, unit, description, image_id, available, featured, display_order, original_price, discount_label, combo_items } = req.validatedData;

  const [existing] = await pool.query('SELECT image_id FROM combos WHERE id = ?', [id]);
  if (existing.length > 0 && existing[0].image_id && existing[0].image_id !== image_id) {
    const oldImageId = existing[0].image_id;
    if (ObjectId.isValid(oldImageId)) {
      const db = getDb();
      const image = await db.collection('images').findOne({ _id: new ObjectId(oldImageId) });
      if (image) {
        if (image.storageType === 'disk') {
          const filePath = path.join(__dirname, '../../', config.UPLOAD_DIR, image.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
        await db.collection('images').deleteOne({ _id: new ObjectId(oldImageId) });
      }
    }
  }

  const finalDisplayOrder = display_order !== undefined ? display_order : 0;
  if (finalDisplayOrder > 0) {
    const [orderExisting] = await pool.query('SELECT name FROM combos WHERE display_order = ? AND id != ? AND deleted = 0 LIMIT 1', [finalDisplayOrder, id]);
    if (orderExisting.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by ${orderExisting[0].name}.` });
    }
  }

  await pool.query(
    'UPDATE combos SET name = ?, price = ?, unit = ?, description = ?, image_id = ?, available = ?, featured = ?, display_order = ?, original_price = ?, discount_label = ? WHERE id = ?',
    [
      name, price, unit, description, image_id, available,
      featured !== undefined ? featured : false,
      finalDisplayOrder,
      original_price || null,
      discount_label || null,
      id
    ]
  );
  await saveComboItems(id, combo_items);
  res.status(200).json({ message: 'Combo updated' });
};

const deleteCombo = async (req, res) => {
  const { id } = req.params;
  const [existing] = await pool.query('SELECT id FROM combos WHERE id = ?', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Combo not found' });
  }

  await pool.query('UPDATE combos SET deleted = 1 WHERE id = ?', [id]);
  res.status(200).json({ message: 'Combo soft deleted' });
};

const updateComboAvailability = async (req, res) => {
  const { id } = req.params;
  const finalAvail = req.validatedData?.available;
  if (finalAvail === undefined) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Availability status required' });
  }

  const normalizedAvailable = finalAvail === true || finalAvail === 'true' || finalAvail === 1 || finalAvail === '1';
  await pool.query('UPDATE combos SET available = ? WHERE id = ?', [normalizedAvailable ? 1 : 0, id]);
  
  const [updatedRows] = await pool.query('SELECT * FROM combos WHERE id = ?', [id]);
  res.status(200).json({ message: 'Combo availability updated', combo: updatedRows[0] });
};

module.exports = {
  getAdminCombos,
  getAdminComboById,
  createCombo,
  updateCombo,
  deleteCombo,
  updateComboAvailability
};
