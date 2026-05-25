const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const attachImageUrls = async (rows) => {
  const imageIds = rows
    .map(row => row.image_id)
    .filter(id => id && ObjectId.isValid(id))
    .map(id => new ObjectId(id));

  if (imageIds.length === 0) return rows;

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

  return rows;
};

const getCategories = async (req, res) => {
  const type = req.query.type || req.query.storeType || req.query.store_type;
  const normalizedType = type === 'Fast Food' ? 'fast_food' : type === 'Packed Items' ? 'packed' : type;
  const params = [];
  let query = `
    SELECT c.*, (
      SELECT COUNT(*)
      FROM products p
      WHERE p.category_id = c.id AND p.deleted = 0 AND p.is_combo = 0
    ) as product_count
    FROM categories c
    WHERE c.active = 1 AND c.deleted = 0
  `;

  if (normalizedType) {
    query += ' AND c.type = ?';
    params.push(normalizedType);
  }

  query += ' ORDER BY c.display_order ASC, c.id ASC';

  const [rows] = await pool.query(query, params);
  await attachImageUrls(rows);
  res.status(200).json({ data: rows, categories: rows });
};

const getAdminCategories = async (req, res) => {
  const [rows] = await pool.query(`
    SELECT c.*, (
      SELECT COUNT(*)
      FROM products p
      WHERE p.category_id = c.id AND p.deleted = 0 AND p.is_combo = 0
    ) as product_count
    FROM categories c
    WHERE c.deleted = 0
    ORDER BY c.display_order ASC, c.id ASC
  `);
  await attachImageUrls(rows);
  res.status(200).json({ data: rows });
};

const createCategory = async (req, res) => {
  const { name, type, image_id, active } = req.validatedData;
  const slug = req.validatedData.slug || slugify(name);
  const displayOrder = req.validatedData.display_order ?? 0;

  if (displayOrder > 0) {
    const [existing] = await pool.query('SELECT name FROM categories WHERE type = ? AND display_order = ? AND deleted = 0 LIMIT 1', [type, displayOrder]);
    if (existing.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${displayOrder} is already used by ${existing[0].name} in ${type}.` });
    }
  }

  const [result] = await pool.query(
    'INSERT INTO categories (name, slug, type, image_id, active, display_order) VALUES (?, ?, ?, ?, ?, ?)',
    [name, slug, type, image_id, active !== undefined ? active : true, displayOrder]
  );
  res.status(201).json({ message: 'Category created', id: result.insertId });
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, type, image_id, active } = req.validatedData;
  const slug = req.validatedData.slug || slugify(name);
  const displayOrder = req.validatedData.display_order ?? 0;

  if (displayOrder > 0) {
    const [existing] = await pool.query('SELECT name FROM categories WHERE type = ? AND display_order = ? AND id != ? AND deleted = 0 LIMIT 1', [type, displayOrder, id]);
    if (existing.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${displayOrder} is already used by ${existing[0].name} in ${type}.` });
    }
  }

  await pool.query(
    'UPDATE categories SET name = ?, slug = ?, type = ?, image_id = ?, active = ?, display_order = ? WHERE id = ?',
    [name, slug, type, image_id, active, displayOrder, id]
  );
  res.status(200).json({ message: 'Category updated' });
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  await pool.query('UPDATE categories SET deleted = 1 WHERE id = ?', [id]);
  res.status(200).json({ message: 'Category soft deleted' });
};

module.exports = {
  getCategories,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory
};
