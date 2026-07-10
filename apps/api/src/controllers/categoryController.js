const { pool } = require('../db/mysql');
const { normalizeStoreType } = require('../utils/storeMode');
const { createTtlCache } = require('../utils/ttlCache');
const { cleanupOrphanedImage } = require('./imageController');

// Categories are read on every customer home/open. 60-second cache eliminates
// the bulk of repeated SELECTs. Invalidated on any CRUD.
const categoriesCache = createTtlCache({ ttlMs: 60_000 });

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
    .filter(id => id && /^\d+$/.test(String(id)));

  if (imageIds.length === 0) return rows;

  const [images] = await pool.query('SELECT id, url FROM images WHERE id IN (?)', [imageIds]);
  const imageMap = {};
  images.forEach(image => {
    imageMap[String(image.id)] = image.url;
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
  const normalizedType = type
    ? await normalizeStoreType(type, { allowAll: true })
    : 'all';
  const cacheKey = `categories:public:${normalizedType}`;

  const data = await categoriesCache.wrap(cacheKey, async () => {
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

    if (normalizedType !== 'all') {
      query += ' AND c.type = ?';
      params.push(normalizedType);
    }

    query += ' ORDER BY c.display_order ASC, c.id ASC';

    const [rows] = await pool.query(query, params);
    await attachImageUrls(rows);
    return rows;
  });

  res.status(200).json({ data, categories: data });
};

const getAdminCategories = async (req, res) => {
  const type = req.query.type || req.query.storeType || req.query.store_type;
  const normalizedType = type ? await normalizeStoreType(type, { allowAll: true }) : null;
  const params = [];
  let query = `
    SELECT c.*, (
      SELECT COUNT(*)
      FROM products p
      WHERE p.category_id = c.id AND p.deleted = 0 AND p.is_combo = 0
    ) as product_count
    FROM categories c
    WHERE c.deleted = 0
  `;

  if (normalizedType && normalizedType !== 'all') {
    query += ' AND c.type = ?';
    params.push(normalizedType);
  }

  query += ' ORDER BY c.display_order ASC, c.id ASC';

  const [rows] = await pool.query(query, params);
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
  categoriesCache.del();
  res.status(201).json({ message: 'Category created', id: result.insertId });
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, type, image_id, active } = req.validatedData;
  const slug = req.validatedData.slug || slugify(name);
  const displayOrder = req.validatedData.display_order ?? 0;

  const [currentRows] = await pool.query('SELECT id, image_id FROM categories WHERE id = ? AND deleted = 0', [id]);
  if (currentRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Category not found' });
  }
  const previousImageId = currentRows[0].image_id;

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
  categoriesCache.del();
  if (previousImageId && String(previousImageId) !== String(image_id)) {
    await cleanupOrphanedImage(previousImageId);
  }
  res.status(200).json({ message: 'Category updated' });
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  const [currentRows] = await pool.query('SELECT id, image_id FROM categories WHERE id = ? AND deleted = 0', [id]);
  if (currentRows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Category not found' });
  }

  const [[productUsage]] = await pool.query(
    'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND deleted = 0',
    [id]
  );
  if (Number(productUsage.count) > 0) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Cannot delete category while active products still use it'
    });
  }

  const [[dashboardUsage]] = await pool.query(
    `SELECT COUNT(*) as count
     FROM dashboard_section_items
     WHERE item_type = 'category' AND item_id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (Number(dashboardUsage.count) > 0) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Cannot delete category while it is assigned to the mobile dashboard'
    });
  }

  await pool.query('UPDATE categories SET deleted = 1 WHERE id = ?', [id]);
  await cleanupOrphanedImage(currentRows[0].image_id);
  categoriesCache.del();
  res.status(200).json({ message: 'Category soft deleted' });
};

module.exports = {
  getCategories,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory
};
