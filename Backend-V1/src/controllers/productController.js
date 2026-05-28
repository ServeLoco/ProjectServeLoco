const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { normalizeStoreType } = require('../utils/storeMode');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const { validatePagination } = require('../validators');

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
      ci.combo_id as combo_product_id,
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
    const comboId = row.combo_product_id;
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

const attachComboItems = async (products = []) => {
  const comboIds = products.filter(product => product.is_combo).map(product => product.id);
  const comboItemsMap = await getComboItemsByComboIds(comboIds);

  products.forEach(product => {
    const comboItems = comboItemsMap[product.id] || [];
    product.combo_items = comboItems;
    product.comboItems = comboItems;
    product.combo_count = comboItems.length;
  });
};

const getProducts = async (req, res) => {
  const { categoryId, category_id, search, type, storeType, store_type, isCombo, is_combo, featured, limit } = req.query;
  const requestedType = type || storeType || store_type;
  const normalizedType = requestedType 
    ? normalizeStoreType(requestedType, { allowAll: true }) 
    : 'all';
  const finalCategoryId = categoryId || category_id;
  let finalIsCombo = isCombo !== undefined ? isCombo : is_combo;

  // If filtering by category/categoryType/categoryId and isCombo isn't explicitly set, default to false (exclude combos)
  if (finalIsCombo === undefined && (finalCategoryId || (requestedType && requestedType !== 'all'))) {
    finalIsCombo = 'false';
  }

  const productQuery = `SELECT p.id, p.name, p.price, p.unit, p.description, p.image_id, p.available, p.is_combo, p.featured, p.original_price, p.discount_label, p.category_id, c.name as category_name, c.type as category_type, c.display_order as cat_display_order, p.display_order as item_display_order
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.available = 1 AND p.deleted = 0 AND p.is_combo = 0`;
  
  const comboQuery = `SELECT p.id, p.name, p.price, p.unit, p.description, p.image_id, p.available, 1 as is_combo, p.featured, p.original_price, p.discount_label, NULL as category_id, NULL as category_name, p.store_type as category_type, 999 as cat_display_order, p.display_order as item_display_order
    FROM combos p
    WHERE p.available = 1 AND p.deleted = 0`;

  let finalQuery = '';
  const finalParams = [];

  const buildSubQuery = (baseQuery, isComboType) => {
    let q = baseQuery;
    if (finalCategoryId && !isComboType) q += ` AND p.category_id = ${pool.escape(finalCategoryId)}`;
    if (normalizedType !== 'all' && !isComboType) q += ` AND c.type = ${pool.escape(normalizedType)}`;
    if (normalizedType !== 'all' && isComboType) q += ` AND p.store_type = ${pool.escape(normalizedType)}`;
    if (search) q += ` AND p.name LIKE ${pool.escape('%' + search + '%')}`;
    if (featured !== undefined) q += ` AND p.featured = ${featured === 'true' || featured === '1' ? 1 : 0}`;
    return q;
  };

  if (finalIsCombo === true || finalIsCombo === '1' || finalIsCombo === 'true') {
    finalQuery = buildSubQuery(comboQuery, true);
  } else if (finalIsCombo === false || finalIsCombo === '0' || finalIsCombo === 'false') {
    finalQuery = buildSubQuery(productQuery, false);
  } else {
    // Public product lists default to real products only. Combos are shown through
    // dashboard combo sections or when explicitly requested with isCombo=true.
    finalQuery = buildSubQuery(productQuery, false);
  }

  finalQuery += ' ORDER BY cat_display_order ASC, item_display_order ASC, id ASC';
  if (limit && Number.isInteger(Number(limit)) && Number(limit) > 0) {
    finalQuery += ' LIMIT ?';
    finalParams.push(Number(limit));
  }

  const [rows] = await pool.query(finalQuery, finalParams);

  await resolveImageUrls(rows);
  await attachComboItems(rows);

  res.status(200).json({ data: { products: rows }, products: rows });
};

const getProductById = async (req, res) => {
  const { id } = req.params;
  const requestedCombo = req.query.type === 'combo' || req.query.isCombo === 'true' || req.query.is_combo === '1';

  const loadCombo = async () => {
    const [comboRows] = await pool.query(
      "SELECT p.*, 1 as is_combo, NULL as category_name, p.store_type as category_type FROM combos p WHERE p.id = ? AND p.deleted = 0",
      [id]
    );
    if (comboRows.length === 0) return null;
    const combo = comboRows[0];
    await resolveImageUrls([combo]);
    await attachComboItems([combo]);
    return combo;
  };

  if (requestedCombo) {
    const combo = await loadCombo();
    if (!combo) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Combo not found' });
    }
    return res.status(200).json({ data: combo });
  }

  const [rows] = await pool.query(
    'SELECT p.*, c.name as category_name, c.type as category_type FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ? AND p.deleted = 0',
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  const product = rows[0];
  await resolveImageUrls([product]);
  await attachComboItems([product]);

  res.status(200).json({ data: product });
};

const createProduct = async (req, res) => {
  // Normal products require category. Combos are bundles and do not require category.
  const { name, price, category_id, unit, description, image_id, available, featured, display_order, original_price, discount_label } = req.validatedData;
  
  const finalDisplayOrder = display_order !== undefined ? display_order : 0;
  if (finalDisplayOrder > 0) {
    const [existing] = await pool.query('SELECT name FROM products WHERE category_id = ? AND display_order = ? AND deleted = 0 LIMIT 1', [category_id, finalDisplayOrder]);
    if (existing.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by ${existing[0].name} in this category.` });
    }
  }

  const [result] = await pool.query(
    'INSERT INTO products (name, price, category_id, unit, description, image_id, available, is_combo, featured, display_order, original_price, discount_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      name, price, category_id, unit, description, image_id, 
      available !== undefined ? available : true,
      false,
      featured !== undefined ? featured : false,
      finalDisplayOrder,
      original_price || null,
      discount_label || null
    ]
  );
  res.status(201).json({ message: 'Product created', id: result.insertId });
};

const updateProduct = async (req, res) => {
  // Normal products require category. Combos are bundles and do not require category.
  const { id } = req.params;
  const { name, price, category_id, unit, description, image_id, available, featured, display_order, original_price, discount_label } = req.validatedData;

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

  const finalDisplayOrder = display_order !== undefined ? display_order : 0;
  if (finalDisplayOrder > 0) {
    const [orderExisting] = await pool.query('SELECT name FROM products WHERE category_id = ? AND display_order = ? AND id != ? AND deleted = 0 LIMIT 1', [category_id, finalDisplayOrder, id]);
    if (orderExisting.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by ${orderExisting[0].name} in this category.` });
    }
  }

  await pool.query(
    'UPDATE products SET name = ?, price = ?, category_id = ?, unit = ?, description = ?, image_id = ?, available = ?, is_combo = ?, featured = ?, display_order = ?, original_price = ?, discount_label = ? WHERE id = ?',
    [
      name, price, category_id, unit, description, image_id, available,
      false,
      featured !== undefined ? featured : false,
      finalDisplayOrder,
      original_price || null,
      discount_label || null,
      id
    ]
  );
  await pool.query('DELETE FROM product_combo_items WHERE combo_product_id = ?', [id]);
  res.status(200).json({ message: 'Product updated' });
};

const getAdminProducts = async (req, res) => {
  const { categoryId, category_id, search, available, isCombo, is_combo, featured, type, page, limit } = req.query;
  const finalCategoryId = categoryId || category_id;
  const finalIsCombo = isCombo !== undefined ? isCombo : is_combo;
  const normalizedType = type ? normalizeStoreType(type, { allowAll: true }) : null;
  const pagination = validatePagination(page, limit);

  let whereClause = 'WHERE p.deleted = 0';
  const params = [];

  if (finalCategoryId) {
    whereClause += ' AND p.category_id = ?';
    params.push(finalCategoryId);
  }

  if (search) {
    whereClause += ' AND p.name LIKE ?';
    params.push(`%${search}%`);
  }

  if (normalizedType && normalizedType !== 'all') {
    whereClause += ' AND c.type = ?';
    params.push(normalizedType);
  }

  if (available !== undefined) {
    whereClause += ' AND p.available = ?';
    params.push(available === 'true' || available === '1' ? 1 : 0);
  }

  if (finalIsCombo !== undefined) {
    whereClause += ' AND p.is_combo = ?';
    params.push(finalIsCombo === 'true' || finalIsCombo === '1' ? 1 : 0);
  }

  if (featured !== undefined) {
    whereClause += ' AND p.featured = ?';
    params.push(featured === 'true' || featured === '1' ? 1 : 0);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM products p LEFT JOIN categories c ON p.category_id = c.id ${whereClause}`,
    params
  );
  const total = countRows[0].total;
  const totalPages = Math.ceil(total / pagination.limit);

  const query = `
    SELECT p.*, c.name as category_name, c.type as category_type 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    ${whereClause}
    ORDER BY p.display_order ASC, p.id DESC
    LIMIT ? OFFSET ?
  `;
  
  params.push(pagination.limit, (pagination.page - 1) * pagination.limit);

  const [rows] = await pool.query(query, params);

  await resolveImageUrls(rows);
  res.status(200).json({ 
    data: { products: rows }, 
    products: rows,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages
    }
  });
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

  const product = rows[0];
  await resolveImageUrls([product]);
  res.status(200).json({ data: product });
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
