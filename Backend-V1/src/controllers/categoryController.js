const { pool } = require('../db/mysql');

const getCategories = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM categories WHERE active = 1 ORDER BY id ASC');
  res.status(200).json({ data: rows });
};

const createCategory = async (req, res) => {
  const { name, slug, type, image_id, active } = req.validatedData;
  const [result] = await pool.query(
    'INSERT INTO categories (name, slug, type, image_id, active) VALUES (?, ?, ?, ?, ?)',
    [name, slug, type, image_id, active !== undefined ? active : true]
  );
  res.status(201).json({ message: 'Category created', id: result.insertId });
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, slug, type, image_id, active } = req.validatedData;

  await pool.query(
    'UPDATE categories SET name = ?, slug = ?, type = ?, image_id = ?, active = ? WHERE id = ?',
    [name, slug, type, image_id, active, id]
  );
  res.status(200).json({ message: 'Category updated' });
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory
};
