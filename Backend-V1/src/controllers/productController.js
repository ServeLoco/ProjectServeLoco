const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const getProducts = async (req, res) => {
  const { categoryId, category_id, search, type } = req.query;
  const finalCategoryId = categoryId || category_id;

  let query = 'SELECT p.*, c.name as category_name, c.type as category_type FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.available = 1 AND p.deleted = 0';
  const params = [];

  if (finalCategoryId) {
    query += ' AND p.category_id = ?';
    params.push(finalCategoryId);
  }

  if (type) {
    query += ' AND c.type = ?';
    params.push(type);
  }

  if (search) {
    query += ' AND p.name LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY c.display_order ASC, p.id ASC';

  const [rows] = await pool.query(query, params);

  // Resolve image URLs from MongoDB
  const imageIds = rows.map(r => r.image_id).filter(id => id && ObjectId.isValid(id)).map(id => new ObjectId(id));
  if (imageIds.length > 0) {
    const db = getDb();
    const images = await db.collection('images').find({ _id: { $in: imageIds } }).toArray();
    const imageMap = {};
    images.forEach(img => { imageMap[img._id.toString()] = img.url; });
    rows.forEach(r => {
      if (r.image_id && imageMap[r.image_id]) r.imageUrl = imageMap[r.image_id];
    });
  }

  res.status(200).json({ data: { products: rows }, products: rows });
};

const getProductById = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    'SELECT p.*, c.name as category_name, c.type as category_type FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?',
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  const product = rows[0];
  if (product.image_id && ObjectId.isValid(product.image_id)) {
    const db = getDb();
    const image = await db.collection('images').findOne({ _id: new ObjectId(product.image_id) });
    if (image) product.imageUrl = image.url;
  }

  res.status(200).json({ data: product });
};

const createProduct = async (req, res) => {
  const { name, price, category_id, unit, description, image_id, available, is_combo, featured, display_order, original_price, discount_label } = req.validatedData;
  const [result] = await pool.query(
    'INSERT INTO products (name, price, category_id, unit, description, image_id, available, is_combo, featured, display_order, original_price, discount_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      name, price, category_id, unit, description, image_id, 
      available !== undefined ? available : true,
      is_combo !== undefined ? is_combo : false,
      featured !== undefined ? featured : false,
      display_order !== undefined ? display_order : 0,
      original_price || null,
      discount_label || null
    ]
  );
  res.status(201).json({ message: 'Product created', id: result.insertId });
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, price, category_id, unit, description, image_id, available, is_combo, featured, display_order, original_price, discount_label } = req.validatedData;

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
    'UPDATE products SET name = ?, price = ?, category_id = ?, unit = ?, description = ?, image_id = ?, available = ?, is_combo = ?, featured = ?, display_order = ?, original_price = ?, discount_label = ? WHERE id = ?',
    [
      name, price, category_id, unit, description, image_id, available,
      is_combo !== undefined ? is_combo : false,
      featured !== undefined ? featured : false,
      display_order !== undefined ? display_order : 0,
      original_price || null,
      discount_label || null,
      id
    ]
  );
  res.status(200).json({ message: 'Product updated' });
};

const getAdminProducts = async (req, res) => {
  const { categoryId, category_id, search, available, isCombo, is_combo, featured } = req.query;
  const finalCategoryId = categoryId || category_id;
  const finalIsCombo = isCombo !== undefined ? isCombo : is_combo;
  let query = `
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.deleted = 0
  `;
  const params = [];

  if (finalCategoryId) {
    query += ' AND p.category_id = ?';
    params.push(finalCategoryId);
  }

  if (search) {
    query += ' AND p.name LIKE ?';
    params.push(`%${search}%`);
  }

  if (available !== undefined) {
    query += ' AND p.available = ?';
    params.push(available === 'true' || available === '1' ? 1 : 0);
  }

  if (finalIsCombo !== undefined) {
    query += ' AND p.is_combo = ?';
    params.push(finalIsCombo === 'true' || finalIsCombo === '1' ? 1 : 0);
  }

  if (featured !== undefined) {
    query += ' AND p.featured = ?';
    params.push(featured === 'true' || featured === '1' ? 1 : 0);
  }

  query += ' ORDER BY p.id DESC';

  const [rows] = await pool.query(query, params);

  // Resolve image URLs
  const imageIds = rows.map(r => r.image_id).filter(id => id && ObjectId.isValid(id)).map(id => new ObjectId(id));
  if (imageIds.length > 0) {
    const db = getDb();
    const images = await db.collection('images').find({ _id: { $in: imageIds } }).toArray();
    const imageMap = {};
    images.forEach(img => {
      imageMap[img._id.toString()] = img.url;
    });
    rows.forEach(r => {
      if (r.image_id && imageMap[r.image_id]) {
        r.imageUrl = imageMap[r.image_id];
      }
    });
  }

  res.status(200).json({ data: { products: rows }, products: rows });
};

const getAdminProductById = async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(`
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.id = ?
  `, [id]);
  
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  res.status(200).json({ data: rows[0] });
};

const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const [existing] = await pool.query('SELECT image_id FROM products WHERE id = ?', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  await pool.query('UPDATE products SET deleted = 1 WHERE id = ?', [id]);
  res.status(200).json({ message: 'Product soft deleted' });
};

const updateProductAvailability = async (req, res) => {
  const { id } = req.params;
  const finalAvail = req.validatedData?.available;
  if (finalAvail === undefined) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Availability status required' });
  }

  const normalizedAvailable = finalAvail === true || finalAvail === 'true' || finalAvail === 1 || finalAvail === '1';
  await pool.query('UPDATE products SET available = ? WHERE id = ?', [normalizedAvailable ? 1 : 0, id]);
  
  const [updatedRows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  res.status(200).json({ message: 'Product availability updated', product: updatedRows[0] });
};

const updateProductImage = async (req, res) => {
  const { id } = req.params;
  const { imageId, image_id } = req.body;
  const finalImageId = imageId || image_id;

  if (!finalImageId) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Image ID required' });
  }

  const [existing] = await pool.query('SELECT image_id FROM products WHERE id = ?', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  if (existing[0].image_id && existing[0].image_id !== finalImageId) {
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

  await pool.query('UPDATE products SET image_id = ? WHERE id = ?', [finalImageId, id]);
  
  const [updatedRows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  res.status(200).json({ message: 'Product image updated', product: updatedRows[0] });
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  getAdminProducts,
  getAdminProductById,
  deleteProduct,
  updateProductAvailability,
  updateProductImage
};
