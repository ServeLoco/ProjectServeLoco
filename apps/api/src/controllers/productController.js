const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { normalizeStoreType } = require('../utils/storeMode');
const { validatePagination } = require('../validators');
const { cleanupOrphanedImage } = require('./imageController');

const isWithinTimeWindow = (from, until) => {
  // Both null means always available in the time sense.
  if (!from || !until) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = String(from).split(':').map(Number);
  const [uh, um] = String(until).split(':').map(Number);
  const start = fh * 60 + (fm || 0);
  const end = uh * 60 + (um || 0);
  if (start === end) return true; // no real window
  if (start < end) {
    return cur >= start && cur < end;
  }
  // Window crosses midnight (e.g. 22:00 -> 02:00)
  return cur >= start || cur < end;
};

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
  const { categoryId, category_id, search, type, storeType, store_type, isCombo, is_combo, featured, limit, offerId, offer_id } = req.query;
  const requestedType = type || storeType || store_type;
  const normalizedType = requestedType 
    ? normalizeStoreType(requestedType, { allowAll: true }) 
    : 'all';
  const finalCategoryId = categoryId || category_id;
  let finalIsCombo = isCombo !== undefined ? isCombo : is_combo;
  const finalOfferId = offerId || offer_id;

  if (finalOfferId) {
    // 1. Validate the offer
    const [offers] = await pool.query('SELECT store_type, active, deleted, is_clickable FROM offers WHERE id = ?', [finalOfferId]);
    if (offers.length === 0 || offers[0].deleted || !offers[0].active || !offers[0].is_clickable) {
      return res.status(200).json({ data: { products: [] }, products: [] });
    }
    if (normalizedType !== 'all' && offers[0].store_type !== normalizedType) {
      return res.status(200).json({ data: { products: [] }, products: [] });
    }

    // 2. Fetch products attached to offer
    let query = `
      SELECT p.id, p.name, p.price, p.unit, p.description, p.image_id, p.available, p.is_combo, p.featured, p.original_price, p.discount_label, p.available_from_time, p.available_until_time, p.category_id, c.name as category_name, c.type as category_type, c.display_order as cat_display_order, p.display_order as item_display_order
      FROM offer_products op
      JOIN products p ON op.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE op.offer_id = ? AND op.active = 1 AND p.available = 1 AND p.deleted = 0 AND p.is_combo = 0
    `;
    const params = [finalOfferId];

    if (normalizedType !== 'all') {
      query += ` AND c.type = ?`;
      params.push(normalizedType);
    }

    query += ' ORDER BY op.display_order ASC, item_display_order ASC, p.id ASC';
    
    if (limit && Number.isInteger(Number(limit)) && Number(limit) > 0) {
      query += ' LIMIT ?';
      params.push(Number(limit));
    }

    const [rows] = await pool.query(query, params);
    await resolveImageUrls(rows);
    const filteredRows = rows.filter(r => isWithinTimeWindow(r.available_from_time, r.available_until_time));
    return res.status(200).json({ data: { products: filteredRows }, products: filteredRows });
  }

  // If filtering by category/categoryType/categoryId and isCombo isn't explicitly set, default to false (exclude combos)
  if (finalIsCombo === undefined && (finalCategoryId || (requestedType && requestedType !== 'all'))) {
    finalIsCombo = 'false';
  }

  const productQuery = `SELECT p.id, p.name, p.price, p.unit, p.description, p.image_id, p.available, p.is_combo, p.featured, p.original_price, p.discount_label, p.available_from_time, p.available_until_time, p.category_id, c.name as category_name, c.type as category_type, c.display_order as cat_display_order, p.display_order as item_display_order
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

  const filteredRows = rows.filter(r => isWithinTimeWindow(r.available_from_time, r.available_until_time));

  res.status(200).json({ data: { products: filteredRows }, products: filteredRows });
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

  // Annotate the response with whether the product is in its daily time window.
  // The product is still returned so the customer app can show an
  // "available from 09:00 to 18:00" hint instead of a hard 404.
  product.in_time_window = isWithinTimeWindow(product.available_from_time, product.available_until_time);

  res.status(200).json({ data: product });
};

const createProduct = async (req, res) => {
  // Normal products require category. Combos are bundles and do not require category.
  const { name, price, category_id, unit, description, image_id, available, featured, display_order, original_price, discount_label, available_from_time, available_until_time } = req.validatedData;

  const finalDisplayOrder = display_order !== undefined ? display_order : 0;
  if (finalDisplayOrder > 0) {
    const [existing] = await pool.query('SELECT name FROM products WHERE category_id = ? AND display_order = ? AND deleted = 0 LIMIT 1', [category_id, finalDisplayOrder]);
    if (existing.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by ${existing[0].name} in this category.` });
    }
  }

  const [result] = await pool.query(
    'INSERT INTO products (name, price, category_id, unit, description, image_id, available, is_combo, featured, display_order, original_price, discount_label, available_from_time, available_until_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      name, price, category_id, unit, description, image_id, 
      available !== undefined ? available : true,
      false,
      featured !== undefined ? featured : false,
      finalDisplayOrder,
      original_price || null,
      discount_label || null,
      available_from_time || null,
      available_until_time || null
    ]
  );
  res.status(201).json({ message: 'Product created', id: result.insertId });
};

const updateProduct = async (req, res) => {
  // Normal products require category. Combos are bundles and do not require category.
  const { id } = req.params;
  const { name, price, category_id, unit, description, image_id, available, featured, display_order, original_price, discount_label, available_from_time, available_until_time } = req.validatedData;

  const [existing] = await pool.query('SELECT id, image_id FROM products WHERE id = ? AND deleted = 0', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }
  const previousImageId = existing[0].image_id;

  const finalDisplayOrder = display_order !== undefined ? display_order : 0;
  if (finalDisplayOrder > 0) {
    const [orderExisting] = await pool.query('SELECT name FROM products WHERE category_id = ? AND display_order = ? AND id != ? AND deleted = 0 LIMIT 1', [category_id, finalDisplayOrder, id]);
    if (orderExisting.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by ${orderExisting[0].name} in this category.` });
    }
  }

  await pool.query(
    'UPDATE products SET name = ?, price = ?, category_id = ?, unit = ?, description = ?, image_id = ?, available = ?, is_combo = ?, featured = ?, display_order = ?, original_price = ?, discount_label = ?, available_from_time = ?, available_until_time = ? WHERE id = ?',
    [
      name, price, category_id, unit, description, image_id, available,
      false,
      featured !== undefined ? featured : false,
      finalDisplayOrder,
      original_price || null,
      discount_label || null,
      available_from_time || null,
      available_until_time || null,
      id
    ]
  );
  await pool.query('DELETE FROM product_combo_items WHERE combo_product_id = ?', [id]);
  if (previousImageId && String(previousImageId) !== String(image_id)) {
    await cleanupOrphanedImage(previousImageId);
  }
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
  const [rows] = await pool.query('SELECT id, image_id FROM products WHERE id = ? AND deleted = 0', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }

  await pool.query('UPDATE products SET deleted = 1 WHERE id = ?', [id]);
  await cleanupOrphanedImage(rows[0].image_id);
  res.status(200).json({ message: 'Product soft deleted' });
};

const updateProductAvailability = async (req, res) => {
  const { id } = req.params;
  const finalAvail = req.validatedData?.available;
  if (finalAvail === undefined) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Availability status required' });
  }

  const normalizedAvailable = finalAvail === true || finalAvail === 'true' || finalAvail === 1 || finalAvail === '1';
  const [result] = await pool.query('UPDATE products SET available = ? WHERE id = ? AND deleted = 0', [normalizedAvailable ? 1 : 0, id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }
  
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

  const [existing] = await pool.query('SELECT id, image_id FROM products WHERE id = ? AND deleted = 0', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }
  const previousImageId = existing[0].image_id;

  await pool.query('UPDATE products SET image_id = ? WHERE id = ?', [finalImageId, id]);
  if (previousImageId && String(previousImageId) !== String(finalImageId)) {
    await cleanupOrphanedImage(previousImageId);
  }

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

const bulkUpdateProducts = async (req, res) => {
  const { ids, updates } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: '`ids` must be a non-empty array of product IDs.' });
  }
  const numericIds = ids.map(id => parseInt(id, 10)).filter(id => Number.isFinite(id) && id > 0);
  if (numericIds.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid numeric product IDs provided.' });
  }

  const ALLOWED = ['available', 'featured', 'category_id'];
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: '`updates` object is required.' });
  }
  const updateKeys = Object.keys(updates).filter(k => updates[k] !== undefined && updates[k] !== null && updates[k] !== '');
  const disallowed = updateKeys.filter(k => !ALLOWED.includes(k));
  if (disallowed.length > 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Unsupported update fields: ${disallowed.join(', ')}. Allowed: ${ALLOWED.join(', ')}.` });
  }
  const validKeys = updateKeys.filter(k => ALLOWED.includes(k));
  if (validKeys.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'At least one update field is required (available, featured, or category_id).' });
  }

  if (updates.category_id !== undefined) {
    const catId = parseInt(updates.category_id, 10);
    if (!Number.isFinite(catId) || catId <= 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: '`category_id` must be a valid positive integer.' });
    }
    const [cats] = await pool.query('SELECT id FROM categories WHERE id = ? AND deleted = 0', [catId]);
    if (cats.length === 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Category ID ${catId} does not exist or has been deleted.` });
    }
    updates.category_id = catId;
  }

  const [existing] = await pool.query('SELECT id FROM products WHERE id IN (?) AND deleted = 0', [numericIds]);
  const validIds = existing.map(r => r.id);
  const skipped = numericIds.length - validIds.length;

  if (validIds.length === 0) {
    return res.status(200).json({ updated: 0, skipped: numericIds.length, errors: [] });
  }

  const setClauses = [];
  const setValues = [];

  if (validKeys.includes('available')) {
    setClauses.push('available = ?');
    setValues.push(updates.available === true || updates.available === 'true' || updates.available === 1 ? 1 : 0);
  }
  if (validKeys.includes('featured')) {
    setClauses.push('featured = ?');
    setValues.push(updates.featured === true || updates.featured === 'true' || updates.featured === 1 ? 1 : 0);
  }
  if (validKeys.includes('category_id')) {
    setClauses.push('category_id = ?');
    setValues.push(updates.category_id);
  }

  setValues.push(validIds);
  await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id IN (?)`, setValues);

  return res.status(200).json({ updated: validIds.length, skipped, errors: [] });
};

const bulkDeleteProducts = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: '`ids` must be a non-empty array of product IDs.' });
  }
  const numericIds = ids.map(id => parseInt(id, 10)).filter(id => Number.isFinite(id) && id > 0);
  if (numericIds.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid numeric product IDs provided.' });
  }

  const [result] = await pool.query('UPDATE products SET deleted = 1 WHERE id IN (?) AND deleted = 0', [numericIds]);
  const deleted = result.affectedRows;
  const skipped = numericIds.length - deleted;

  // Collect image_ids from rows we actually soft-deleted, then clean up any
  // images that are no longer referenced by any active record.
  if (deleted > 0) {
    try {
      const [softDeleted] = await pool.query(
        'SELECT DISTINCT image_id FROM products WHERE id IN (?) AND image_id IS NOT NULL',
        [numericIds]
      );
      const imageIds = softDeleted.map(r => r.image_id).filter(Boolean);
      for (const imageId of imageIds) {
        await cleanupOrphanedImage(imageId);
      }
    } catch (e) {
      console.error('[bulkDeleteProducts] image cleanup error:', e.message);
    }
  }

  return res.status(200).json({ deleted, skipped, errors: [] });
};

// Re-export with bulk additions
Object.assign(module.exports, { bulkUpdateProducts, bulkDeleteProducts });
