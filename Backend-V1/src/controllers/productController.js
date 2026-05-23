const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const getProducts = async (req, res) => {
  const { categoryId, search } = req.query;
  let query = 'SELECT * FROM products WHERE available = 1';
  const params = [];

  if (categoryId) {
    query += ' AND category_id = ?';
    params.push(categoryId);
  }

  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY id ASC';

  const [rows] = await pool.query(query, params);
  res.status(200).json({ data: rows });
};

const getProductById = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  res.status(200).json({ data: rows[0] });
};

const createProduct = async (req, res) => {
  const { name, price, category_id, unit, description, image_id, available } = req.validatedData;
  const [result] = await pool.query(
    'INSERT INTO products (name, price, category_id, unit, description, image_id, available) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, price, category_id, unit, description, image_id, available !== undefined ? available : true]
  );
  res.status(201).json({ message: 'Product created', id: result.insertId });
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, price, category_id, unit, description, image_id, available } = req.validatedData;

  // Check if image_id changed, delete old image from MongoDB and disk
  const [existing] = await pool.query('SELECT image_id FROM products WHERE id = ?', [id]);
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

  await pool.query(
    'UPDATE products SET name = ?, price = ?, category_id = ?, unit = ?, description = ?, image_id = ?, available = ? WHERE id = ?',
    [name, price, category_id, unit, description, image_id, available, id]
  );
  res.status(200).json({ message: 'Product updated' });
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct
};
