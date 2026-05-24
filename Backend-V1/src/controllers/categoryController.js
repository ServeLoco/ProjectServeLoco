const { pool } = require('../db/mysql');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const getCategories = async (req, res) => {
  const type = req.query.type || req.query.storeType || req.query.store_type;
  const normalizedType = type === 'Fast Food' ? 'fast_food' : type === 'Packed Items' ? 'packed' : type;
  const params = [];
  let query = `
    SELECT c.*, (
      SELECT COUNT(*)
      FROM products p
      WHERE p.category_id = c.id AND p.deleted = 0
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
  res.status(200).json({ data: rows, categories: rows });
};

const getAdminCategories = async (req, res) => {
  const [rows] = await pool.query(`
    SELECT c.*, (
      SELECT COUNT(*)
      FROM products p
      WHERE p.category_id = c.id AND p.deleted = 0
    ) as product_count
    FROM categories c
    WHERE c.deleted = 0
    ORDER BY c.display_order ASC, c.id ASC
  `);
  res.status(200).json({ data: rows });
};

const createCategory = async (req, res) => {
  const { name, type, image_id, active } = req.validatedData;
  const slug = req.validatedData.slug || slugify(name);
  const displayOrder = req.validatedData.display_order ?? 0;
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
