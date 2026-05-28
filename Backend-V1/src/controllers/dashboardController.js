const { pool } = require('../db/mysql');
const { getDb } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { normalizeStoreType } = require('../utils/storeMode');

const SECTION_TYPES = ['offer_banner', 'category_grid', 'product_block', 'combo_block'];
const STORE_TYPES = ['packed', 'fast_food', 'all'];
const SECTION_ITEM_TYPES = {
  offer_banner: 'offer',
  category_grid: 'category',
  product_block: 'product',
  combo_block: 'combo',
};

const getExpectedStoreType = (storeType) => {
  if (!storeType) return 'all';
  return normalizeStoreType(storeType, { fallback: 'all', allowAll: true });
};

const isInvalidDateValue = (value) => value && Number.isNaN(new Date(value).getTime());

const validateVisibilityWindow = (startsAt, endsAt) => {
  if (isInvalidDateValue(startsAt) || isInvalidDateValue(endsAt)) {
    return 'Schedule dates must be valid date/time values';
  }
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    return 'End time must be after start time';
  }
  return null;
};

const asPositiveInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

const validateSectionPayload = ({ title, slug, section_type, store_type, max_visible_items, starts_at, ends_at }, { partial = false } = {}) => {
  if (!partial && (!title || !slug || !section_type)) {
    return 'Title, slug, and section type are required';
  }
  if (section_type !== undefined && !SECTION_TYPES.includes(section_type)) {
    return 'Invalid dashboard section type';
  }
  if (store_type !== undefined && !STORE_TYPES.includes(store_type)) {
    return 'Invalid store visibility';
  }
  if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug))) {
    return 'Slug must use lowercase letters, numbers, and hyphens only';
  }
  if (max_visible_items !== undefined && asPositiveInteger(max_visible_items, 6) === null) {
    return 'Max visible items must be a positive whole number';
  }
  return validateVisibilityWindow(starts_at, ends_at);
};

const getLinkedItemInfo = async (itemType, itemId) => {
  if (itemType === 'product') {
    const [rows] = await pool.query(
      `SELECT p.id, p.is_combo, p.available, c.type as store_type
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ? AND p.deleted = 0`,
      [itemId]
    );
    if (rows.length === 0) return { error: 'Product does not exist' };
    if (rows[0].is_combo) return { error: 'Combos cannot be added to a standard product block.' };
    if (rows[0].available !== undefined && !rows[0].available) return { error: 'Only available products can be added to dashboard blocks.' };
    return { storeType: rows[0].store_type };
  }

  if (itemType === 'category') {
    const [rows] = await pool.query('SELECT id, type as store_type, active FROM categories WHERE id = ? AND deleted = 0', [itemId]);
    if (rows.length === 0) return { error: 'Category does not exist' };
    if (rows[0].active !== undefined && !rows[0].active) return { error: 'Only active categories can be added to the dashboard.' };
    return { storeType: rows[0].store_type };
  }

  if (itemType === 'combo') {
    const [rows] = await pool.query(
      `SELECT p.id, p.available, p.store_type,
        (SELECT COUNT(*) FROM combo_items ci
         JOIN products child ON child.id = ci.product_id
         WHERE ci.combo_id = p.id AND child.deleted = 0 AND child.available = 1) as child_count
       FROM combos p
       WHERE p.id = ? AND p.deleted = 0`,
      [itemId]
    );
    if (rows.length === 0) return { error: 'Combo product does not exist' };
    if (rows[0].available !== undefined && !rows[0].available) return { error: 'Only available combos can be added to dashboard blocks.' };
    if (Number(rows[0].child_count) === 0) return { error: 'Combo must include at least one available product.' };
    return { storeType: rows[0].store_type };
  }

  if (itemType === 'offer') {
    const [rows] = await pool.query('SELECT id, active, store_type FROM offers WHERE id = ? AND deleted = 0', [itemId]);
    if (rows.length === 0) return { error: 'Offer does not exist' };
    if (rows[0].active !== undefined && !rows[0].active) return { error: 'Only active offers can be added to dashboard banners.' };
    return { storeType: rows[0].store_type };
  }

  return { error: 'Invalid item type' };
};

// Helper to resolve image URLs from MongoDB image collection
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

// Helper to fetch combo child items
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
    WHERE ci.combo_id IN (?) AND p.deleted = 0 AND p.available = 1
    ORDER BY ci.combo_id ASC, ci.display_order ASC, p.id ASC`,
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

// Helper to attach combo child items to parent products
const attachComboItems = async (products = []) => {
  const comboIds = products.filter(product => product.is_combo || product.isCombo).map(product => product.id);
  const comboItemsMap = await getComboItemsByComboIds(comboIds);

  products.forEach(product => {
    const comboItems = comboItemsMap[product.id] || [];
    product.combo_items = comboItems;
    product.comboItems = comboItems;
    product.combo_count = comboItems.length;
  });
};

const mapCategoryRows = (rows) => rows.map(r => ({
  id: r.id,
  sectionItemId: r.section_item_id,
  name: r.name,
  slug: r.slug,
  type: r.type,
  imageUrl: r.imageUrl || r.image_url,
  image_id: r.image_id,
  active: r.active,
  displayOrder: r.display_order
}));

const mapProductRows = (rows) => rows.map(r => ({
  id: r.id,
  sectionItemId: r.section_item_id,
  name: r.name,
  price: r.price,
  unit: r.unit,
  description: r.description,
  imageUrl: r.imageUrl || r.image_url,
  image_id: r.image_id,
  available: r.available,
  featured: r.featured,
  originalPrice: r.original_price,
  discountLabel: r.discount_label,
  categoryId: r.category_id,
  categoryName: r.category_name,
  categoryType: r.category_type,
  comboItems: r.combo_items || [],
  isCombo: r.is_combo || r.isCombo || false
}));

const getDefaultCategoryItems = async (expectedStoreType, limit = 8, offset = 0) => {
  const params = [];
  let query = `
    SELECT c.*, c.display_order
    FROM categories c
    WHERE c.active = 1 AND c.deleted = 0
  `;

  if (expectedStoreType && expectedStoreType !== 'all') {
    query += ' AND c.type = ?';
    params.push(expectedStoreType);
  }

  query += ' ORDER BY c.display_order ASC, c.id ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  await resolveImageUrls(rows);
  return mapCategoryRows(rows);
};

const getDefaultComboItems = async (expectedStoreType, limit = 6, offset = 0) => {
  const params = [];
  let query = `
    SELECT p.*, 1 as is_combo, p.store_type as category_type
    FROM combos p
    WHERE p.available = 1 AND p.deleted = 0
  `;

  if (expectedStoreType && expectedStoreType !== 'all') {
    query += ' AND p.store_type = ?';
    params.push(expectedStoreType);
  }

  query += ' ORDER BY p.display_order ASC, p.id ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  await resolveImageUrls(rows);
  await attachComboItems(rows);
  return mapProductRows(rows);
};

/**
 * Public endpoint: GET /api/dashboard
 * Loads active sections & their items based on storeType.
 */
const getDashboard = async (req, res) => {
  // Dashboard category grid is derived from categories.
  const { storeType = 'packed' } = req.query;
  const expectedStoreType = getExpectedStoreType(storeType);

  try {
    let query = `
      SELECT * FROM dashboard_sections 
      WHERE active = 1 AND deleted_at IS NULL
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at >= NOW())
    `;
    const params = [];

    if (expectedStoreType && expectedStoreType !== 'all') {
      query += ' AND store_type = ?';
      params.push(expectedStoreType);
    }

    query += ' ORDER BY display_order ASC, id ASC';

    const [sections] = await pool.query(query, params);
    const configuredTypes = new Set(sections.map(row => row.section_type));
    const resultSections = [];

    for (const section of sections) {
      let items = [];

      if (section.section_type === 'offer_banner') {
        const offerStoreFilter = (expectedStoreType && expectedStoreType !== 'all') ? 'AND o.store_type = ?' : '';
        const params = (expectedStoreType && expectedStoreType !== 'all') ? [section.id, expectedStoreType] : [section.id];
        const [rows] = await pool.query(
          `SELECT dsi.id as section_item_id, dsi.display_order, o.* 
           FROM dashboard_section_items dsi
           JOIN offers o ON o.id = dsi.item_id
           WHERE dsi.section_id = ? AND dsi.item_type = 'offer' AND dsi.active = 1 AND dsi.deleted_at IS NULL
             AND o.active = 1 AND o.deleted = 0
             ${offerStoreFilter}
             AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
             AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
           ORDER BY dsi.display_order ASC, dsi.id ASC`,
          params
        );
        await resolveImageUrls(rows);
        items = rows.map(r => ({
          id: r.id,
          sectionItemId: r.section_item_id,
          title: r.title,
          description: r.description,
          imageUrl: r.imageUrl || r.image_url,
          image_id: r.image_id,
          active: r.active
        }));
      } else if (section.section_type === 'category_grid') {
        const [rows] = await pool.query(
          `SELECT dsi.id as section_item_id, dsi.display_order, c.*
           FROM dashboard_section_items dsi
           JOIN categories c ON c.id = dsi.item_id
           WHERE dsi.section_id = ? AND dsi.item_type = 'category' AND dsi.active = 1 AND dsi.deleted_at IS NULL
             AND c.active = 1 AND c.deleted = 0
             AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
             AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
           ORDER BY dsi.display_order ASC, dsi.id ASC
           LIMIT ?`,
          [section.id, section.max_visible_items || 8]
        );
        await resolveImageUrls(rows);
        
        let filteredRows = rows;
        if (expectedStoreType && expectedStoreType !== 'all') {
          filteredRows = rows.filter(r => r.type === expectedStoreType);
        }
        
        items = mapCategoryRows(filteredRows);
        
        if (items.length === 0) {
          items = await getDefaultCategoryItems(expectedStoreType, section.max_visible_items || 8);
        }
      } else if (section.section_type === 'product_block') {
        const [rows] = await pool.query(
          `SELECT dsi.id as section_item_id, dsi.display_order, p.*, cat.name as category_name, cat.type as category_type
           FROM dashboard_section_items dsi
           JOIN products p ON p.id = dsi.item_id
           LEFT JOIN categories cat ON p.category_id = cat.id
           WHERE dsi.section_id = ? AND dsi.item_type = 'product' AND dsi.active = 1 AND dsi.deleted_at IS NULL
             AND p.available = 1 AND p.deleted = 0 AND p.is_combo = 0
             AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
             AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
           ORDER BY dsi.display_order ASC, dsi.id ASC`,
          [section.id]
        );
        await resolveImageUrls(rows);
        await attachComboItems(rows);

        let filteredRows = rows;
        if (expectedStoreType && expectedStoreType !== 'all') {
          filteredRows = rows.filter(r => r.category_type === expectedStoreType);
        }

        items = mapProductRows(filteredRows);
      } else if (section.section_type === 'combo_block') {
        const comboStoreFilter = (expectedStoreType && expectedStoreType !== 'all') ? 'AND p.store_type = ?' : '';
        const params = (expectedStoreType && expectedStoreType !== 'all') ? [section.id, expectedStoreType] : [section.id];
        const [rows] = await pool.query(
          `SELECT dsi.id as section_item_id, dsi.display_order, p.*, 1 as is_combo, p.store_type as category_type
           FROM dashboard_section_items dsi
           JOIN combos p ON p.id = dsi.item_id
           WHERE dsi.section_id = ? AND dsi.item_type = 'combo' AND dsi.active = 1 AND dsi.deleted_at IS NULL
             AND p.available = 1 AND p.deleted = 0
             ${comboStoreFilter}
             AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
             AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
           ORDER BY dsi.display_order ASC, dsi.id ASC`,
          params
        );
        await resolveImageUrls(rows);
        await attachComboItems(rows);

        let filteredRows = rows;
        items = mapProductRows(filteredRows);
        if (items.length === 0 && section.slug === 'popular-combos') {
          items = await getDefaultComboItems(expectedStoreType, section.max_visible_items || 6);
        }
      }

      const maxVisible = section.section_type === 'offer_banner'
        ? Math.max(Number(section.max_visible_items || 0), items.length)
        : section.max_visible_items || 6;
      const visibleItems = items.slice(0, maxVisible);

      // Hide empty sections by default
      if (visibleItems.length > 0) {
        resultSections.push({
          id: section.id,
          title: section.title,
          slug: section.slug,
          sectionType: section.section_type,
          storeType: section.store_type,
          displayOrder: section.display_order,
          maxVisibleItems: section.max_visible_items,
          showSeeAll: section.show_see_all === 1 || section.show_see_all === true,
          items: visibleItems
        });
      }
    }

    if (!configuredTypes.has('category_grid')) {
      const categoryItems = await getDefaultCategoryItems(expectedStoreType, 8);
      if (categoryItems.length > 0) {
        resultSections.push({
          id: 'default-categories-grid',
          title: 'Shop by Category',
          slug: 'categories-grid',
          sectionType: 'category_grid',
          storeType: expectedStoreType || 'packed',
          displayOrder: 1,
          maxVisibleItems: 8,
          showSeeAll: false,
          items: categoryItems
        });
      }
    }

    if (!configuredTypes.has('combo_block')) {
      const comboItems = await getDefaultComboItems(expectedStoreType, 6);
      if (comboItems.length > 0) {
        resultSections.push({
          id: 'default-popular-combos',
          title: 'Popular Combos',
          slug: 'popular-combos',
          sectionType: 'combo_block',
          storeType: expectedStoreType || 'packed',
          displayOrder: 2,
          maxVisibleItems: 6,
          showSeeAll: true,
          items: comboItems
        });
      }
    }

    resultSections.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));

    res.status(200).json({
      data: {
        sections: resultSections
      }
    });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Public endpoint: GET /api/dashboard/sections/:slug/items
 * Loads full items list for a specific section (useful for See All flow).
 */
const getSectionItems = async (req, res) => {
  const { slug } = req.params;
  const { storeType = 'packed', page = 1, limit = 50 } = req.query;
  const expectedStoreType = getExpectedStoreType(storeType);
  const pageNumber = Math.max(1, Number(page) || 1);
  const limitNumber = Math.min(100, Math.max(1, Number(limit) || 50));
  const offset = (pageNumber - 1) * limitNumber;

  try {
    let sectionQuery = `
      SELECT * FROM dashboard_sections 
      WHERE slug = ? AND active = 1 AND deleted_at IS NULL
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at >= NOW())
    `;
    const sectionParams = [slug];
    if (expectedStoreType && expectedStoreType !== 'all') {
      sectionQuery += ' AND store_type = ?';
      sectionParams.push(expectedStoreType);
    }
    sectionQuery += ' ORDER BY id DESC LIMIT 1';

    const [sections] = await pool.query(sectionQuery, sectionParams);

    if (sections.length === 0 && slug === 'popular-combos') {
      const items = await getDefaultComboItems(expectedStoreType, limitNumber, offset);
      return res.status(200).json({
        data: {
          section: {
            id: 'default-popular-combos',
            title: 'Popular Combos',
            slug: 'popular-combos',
            sectionType: 'combo_block',
            storeType: expectedStoreType || 'packed'
          },
          items
        }
      });
    }

    if (sections.length === 0 && slug === 'categories-grid') {
      const items = await getDefaultCategoryItems(expectedStoreType, limitNumber, offset);
      return res.status(200).json({
        data: {
          section: {
            id: 'default-categories-grid',
            title: 'Shop by Category',
            slug: 'categories-grid',
            sectionType: 'category_grid',
            storeType: expectedStoreType || 'packed'
          },
          items
        }
      });
    }

    if (sections.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Dashboard section not found' });
    }

    const section = sections[0];
    let items = [];

    if (section.section_type === 'offer_banner') {
      const offerStoreFilter = (expectedStoreType && expectedStoreType !== 'all') ? 'AND o.store_type = ?' : '';
      const params = (expectedStoreType && expectedStoreType !== 'all') ? [section.id, expectedStoreType, limitNumber, offset] : [section.id, limitNumber, offset];
      const [rows] = await pool.query(
        `SELECT dsi.id as section_item_id, dsi.display_order, o.* 
         FROM dashboard_section_items dsi
         JOIN offers o ON o.id = dsi.item_id
         WHERE dsi.section_id = ? AND dsi.item_type = 'offer' AND dsi.active = 1 AND dsi.deleted_at IS NULL
           AND o.active = 1 AND o.deleted = 0
           ${offerStoreFilter}
           AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
           AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
         ORDER BY dsi.display_order ASC, dsi.id ASC
         LIMIT ? OFFSET ?`,
        params
      );
      await resolveImageUrls(rows);
      items = rows.map(r => ({
        id: r.id,
        sectionItemId: r.section_item_id,
        title: r.title,
        description: r.description,
        imageUrl: r.imageUrl || r.image_url,
        image_id: r.image_id,
        active: r.active
      }));
    } else if (section.section_type === 'category_grid') {
      const [rows] = await pool.query(
        `SELECT dsi.id as section_item_id, dsi.display_order, c.*
         FROM dashboard_section_items dsi
         JOIN categories c ON c.id = dsi.item_id
         WHERE dsi.section_id = ? AND dsi.item_type = 'category' AND dsi.active = 1 AND dsi.deleted_at IS NULL
           AND c.active = 1 AND c.deleted = 0
           AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
           AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
         ORDER BY dsi.display_order ASC, dsi.id ASC
         LIMIT ? OFFSET ?`,
        [section.id, limitNumber, offset]
      );
      await resolveImageUrls(rows);
      
      let filteredRows = rows;
      if (expectedStoreType && expectedStoreType !== 'all') {
        filteredRows = rows.filter(r => r.type === expectedStoreType);
      }
      
      items = mapCategoryRows(filteredRows);
      
      if (items.length === 0 && offset === 0) {
        items = await getDefaultCategoryItems(expectedStoreType, limitNumber, offset);
      }
    } else if (section.section_type === 'product_block') {
      const productStoreFilter = (expectedStoreType && expectedStoreType !== 'all') ? 'AND cat.type = ?' : '';
      const params = (expectedStoreType && expectedStoreType !== 'all') ? [section.id, expectedStoreType, limitNumber, offset] : [section.id, limitNumber, offset];
      const [rows] = await pool.query(
        `SELECT dsi.id as section_item_id, dsi.display_order, p.*, cat.name as category_name, cat.type as category_type
         FROM dashboard_section_items dsi
         JOIN products p ON p.id = dsi.item_id
         LEFT JOIN categories cat ON p.category_id = cat.id
         WHERE dsi.section_id = ? AND dsi.item_type = 'product' AND dsi.active = 1 AND dsi.deleted_at IS NULL
           AND p.available = 1 AND p.deleted = 0 AND p.is_combo = 0
           ${productStoreFilter}
           AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
           AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
         ORDER BY dsi.display_order ASC, dsi.id ASC
         LIMIT ? OFFSET ?`,
        params
      );
      await resolveImageUrls(rows);
      await attachComboItems(rows);

      items = rows.map(r => ({
        id: r.id,
        sectionItemId: r.section_item_id,
        name: r.name,
        price: r.price,
        unit: r.unit,
        description: r.description,
        imageUrl: r.imageUrl || r.image_url,
        image_id: r.image_id,
        available: r.available,
        isCombo: r.is_combo,
        featured: r.featured,
        originalPrice: r.original_price,
        discountLabel: r.discount_label,
        categoryId: r.category_id,
        categoryName: r.category_name,
        categoryType: r.category_type,
        comboItems: r.combo_items || []
      }));
    } else if (section.section_type === 'combo_block') {
      const comboStoreFilter = (expectedStoreType && expectedStoreType !== 'all') ? 'AND p.store_type = ?' : '';
      const params = (expectedStoreType && expectedStoreType !== 'all') ? [section.id, expectedStoreType, limitNumber, offset] : [section.id, limitNumber, offset];
      const [rows] = await pool.query(
        `SELECT dsi.id as section_item_id, dsi.display_order, p.*, 1 as is_combo, p.store_type as category_type
         FROM dashboard_section_items dsi
         JOIN combos p ON p.id = dsi.item_id
         WHERE dsi.section_id = ? AND dsi.item_type = 'combo' AND dsi.active = 1 AND dsi.deleted_at IS NULL
           AND p.available = 1 AND p.deleted = 0
           ${comboStoreFilter}
           AND (dsi.starts_at IS NULL OR dsi.starts_at <= NOW())
           AND (dsi.ends_at IS NULL OR dsi.ends_at >= NOW())
         ORDER BY dsi.display_order ASC, dsi.id ASC
         LIMIT ? OFFSET ?`,
        params
      );
      await resolveImageUrls(rows);
      await attachComboItems(rows);

      const filteredRows = rows.filter(r => (r.combo_items || []).length > 0);

      items = filteredRows.map(r => ({
        id: r.id,
        sectionItemId: r.section_item_id,
        name: r.name,
        price: r.price,
        unit: r.unit,
        description: r.description,
        imageUrl: r.imageUrl || r.image_url,
        image_id: r.image_id,
        available: r.available,
        isCombo: r.is_combo,
        featured: r.featured,
        originalPrice: r.original_price,
        discountLabel: r.discount_label,
        categoryId: r.category_id,
        categoryName: r.category_name,
        categoryType: r.category_type,
        comboItems: r.combo_items || []
      }));
    }

    res.status(200).json({
      data: {
        section: {
          id: section.id,
          title: section.title,
          slug: section.slug,
          sectionType: section.section_type,
          storeType: section.store_type
        },
        items
      }
    });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: GET /api/admin/dashboard-sections
 */
const getAdminSections = async (req, res) => {
  const { store_type } = req.query;
  try {
    let query = 'SELECT * FROM dashboard_sections WHERE deleted_at IS NULL';
    const params = [];
    if (store_type) {
      query += ' AND (store_type = ? OR store_type = "all")';
      params.push(store_type);
    }
    query += ' ORDER BY display_order ASC, id ASC';
    const [rows] = await pool.query(query, params);
    res.status(200).json({ data: rows });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: GET /api/admin/dashboard-sections/:id
 */
const getAdminSectionById = async (req, res) => {
  const { id } = req.params;
  try {
    const [sections] = await pool.query(
      'SELECT * FROM dashboard_sections WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (sections.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Section not found' });
    }
    const section = sections[0];

    const [items] = await pool.query(
      'SELECT * FROM dashboard_section_items WHERE section_id = ? AND deleted_at IS NULL ORDER BY display_order ASC, id ASC',
      [id]
    );

    const hydratedItems = [];
    for (const item of items) {
      let details = null;
      if (item.item_type === 'product') {
        const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [item.item_id]);
        if (prods.length > 0) {
          details = prods[0];
          await resolveImageUrls([details]);
        }
      } else if (item.item_type === 'category') {
        const [cats] = await pool.query('SELECT * FROM categories WHERE id = ?', [item.item_id]);
        if (cats.length > 0) {
          details = cats[0];
          await resolveImageUrls([details]);
        }
      } else if (item.item_type === 'combo') {
        const [combos] = await pool.query('SELECT *, 1 as is_combo FROM combos WHERE id = ?', [item.item_id]);
        if (combos.length > 0) {
          details = combos[0];
          await resolveImageUrls([details]);
          await attachComboItems([details]);
        }
      } else if (item.item_type === 'offer') {
        const [offers] = await pool.query('SELECT * FROM offers WHERE id = ?', [item.item_id]);
        if (offers.length > 0) {
          details = offers[0];
          await resolveImageUrls([details]);
        }
      }
      hydratedItems.push({
        ...item,
        details
      });
    }

    res.status(200).json({ data: { ...section, items: hydratedItems } });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: POST /api/admin/dashboard-sections
 */
const createAdminSection = async (req, res) => {
  const { title, slug, section_type, store_type, active, display_order, max_visible_items, show_see_all, linked_category_id, linked_offer_id, starts_at, ends_at } = req.body;

  if (store_type === 'all' || !store_type) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Store type must be explicitly packed or fast_food for new sections.' });
  }

  const validationError = validateSectionPayload(req.body);
  if (validationError) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError });
  }
  const maxVisibleItems = asPositiveInteger(max_visible_items, 6);

  try {
    const targetStoreType = store_type || 'all';
    const [existing] = await pool.query(
      'SELECT id FROM dashboard_sections WHERE slug = ? AND store_type = ? AND deleted_at IS NULL LIMIT 1',
      [slug, targetStoreType]
    );
    if (existing.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Section slug "${slug}" already exists for this store mode.` });
    }

    const finalDisplayOrder = display_order !== undefined ? display_order : 0;
    if (finalDisplayOrder > 0) {
      const [orderExisting] = await pool.query(
        'SELECT title FROM dashboard_sections WHERE store_type = ? AND display_order = ? AND deleted_at IS NULL LIMIT 1',
        [store_type, finalDisplayOrder]
      );
      if (orderExisting.length > 0) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by "${orderExisting[0].title}".` });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO dashboard_sections (
        title, slug, section_type, store_type, active, display_order, 
        max_visible_items, show_see_all, linked_category_id, linked_offer_id, starts_at, ends_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        title, slug, section_type, store_type, 
        active !== undefined ? active : 1, 
        finalDisplayOrder,
        maxVisibleItems,
        show_see_all !== undefined ? show_see_all : 1,
        linked_category_id || null,
        linked_offer_id || null,
        starts_at || null,
        ends_at || null
      ]
    );

    res.status(201).json({ message: 'Dashboard section created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: PATCH /api/admin/dashboard-sections/:id
 */
const updateAdminSection = async (req, res) => {
  const { id } = req.params;
  const { title, slug, section_type, store_type, active, display_order, max_visible_items, show_see_all, linked_category_id, linked_offer_id, starts_at, ends_at, version } = req.body;

  if (store_type === 'all') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Store type must be explicitly packed or fast_food. "all" is no longer allowed.' });
  }

  const validationError = validateSectionPayload(req.body, { partial: true });
  if (validationError) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: validationError });
  }

  try {
    const [sections] = await pool.query(
      'SELECT * FROM dashboard_sections WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (sections.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Section not found' });
    }

    const existingSection = sections[0];
    if (version !== undefined && Number(version) !== existingSection.version) {
      return res.status(409).json({
        code: 'CONCURRENCY_CONFLICT',
        message: 'This section was updated by another administrator. Please reload and try again.'
      });
    }

    const targetStoreType = store_type !== undefined ? store_type : existingSection.store_type;
    if (slug && (slug !== existingSection.slug || targetStoreType !== existingSection.store_type)) {
      const [existingSlug] = await pool.query(
        'SELECT id FROM dashboard_sections WHERE slug = ? AND store_type = ? AND deleted_at IS NULL AND id != ? LIMIT 1',
        [slug, targetStoreType, id]
      );
      if (existingSlug.length > 0) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Section slug "${slug}" already exists for this store mode.` });
      }
    }

    const finalDisplayOrder = display_order !== undefined ? display_order : 0;
    if (finalDisplayOrder > 0) {
      const targetStoreType = store_type !== undefined ? store_type : existingSection.store_type;
      const [orderExisting] = await pool.query(
        'SELECT title FROM dashboard_sections WHERE store_type = ? AND display_order = ? AND id != ? AND deleted_at IS NULL LIMIT 1',
        [targetStoreType, finalDisplayOrder, id]
      );
      if (orderExisting.length > 0) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used by "${orderExisting[0].title}".` });
      }
    }

    const nextVersion = existingSection.version + 1;

    await pool.query(
      `UPDATE dashboard_sections SET
        title = ?, slug = ?, store_type = ?, active = ?, display_order = ?,
        max_visible_items = ?, show_see_all = ?, linked_category_id = ?, linked_offer_id = ?,
        starts_at = ?, ends_at = ?, version = ?
       WHERE id = ?`,
      [
        title !== undefined ? title : existingSection.title,
        slug !== undefined ? slug : existingSection.slug,
        store_type !== undefined ? store_type : existingSection.store_type,
        active !== undefined ? active : existingSection.active,
        display_order !== undefined ? display_order : existingSection.display_order,
        max_visible_items !== undefined ? asPositiveInteger(max_visible_items, existingSection.max_visible_items) : existingSection.max_visible_items,
        show_see_all !== undefined ? show_see_all : existingSection.show_see_all,
        linked_category_id !== undefined ? linked_category_id : existingSection.linked_category_id,
        linked_offer_id !== undefined ? linked_offer_id : existingSection.linked_offer_id,
        starts_at !== undefined ? starts_at : existingSection.starts_at,
        ends_at !== undefined ? ends_at : existingSection.ends_at,
        nextVersion,
        id
      ]
    );

    res.status(200).json({ message: 'Dashboard section updated', version: nextVersion });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: DELETE /api/admin/dashboard-sections/:id
 */
const deleteAdminSection = async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await pool.query(
      'SELECT id FROM dashboard_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Section not found' });
    }

    await pool.query(
      'UPDATE dashboard_sections SET deleted_at = NOW() WHERE id = ?',
      [id]
    );
    res.status(200).json({ message: 'Dashboard section deleted' });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: POST /api/admin/dashboard-sections/:id/items
 */
const addAdminSectionItem = async (req, res) => {
  const { id } = req.params;
  const { item_type, item_id, display_order, active, starts_at, ends_at } = req.body;

  if (!item_type || !item_id) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Item type and item ID are required' });
  }

  const scheduleError = validateVisibilityWindow(starts_at, ends_at);
  if (scheduleError) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: scheduleError });
  }

  try {
    const [sections] = await pool.query(
      'SELECT * FROM dashboard_sections WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (sections.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Section not found' });
    }
    const section = sections[0];

    if (SECTION_ITEM_TYPES[section.section_type] !== item_type) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `Item type "${item_type}" is not compatible with section type "${section.section_type}"`
      });
    }

    const itemInfo = await getLinkedItemInfo(item_type, item_id);
    if (itemInfo.error) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: itemInfo.error });
    }

    if (section.store_type !== 'all' && itemInfo.storeType && itemInfo.storeType !== section.store_type) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `This item belongs to "${itemInfo.storeType}" and cannot be added to a "${section.store_type}" section.`
      });
    }

    const [duplicate] = await pool.query(
      'SELECT id FROM dashboard_section_items WHERE section_id = ? AND item_type = ? AND item_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, item_type, item_id]
    );
    if (duplicate.length > 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'This item is already assigned to this section.' });
    }

    const finalDisplayOrder = display_order !== undefined ? display_order : 0;
    if (finalDisplayOrder > 0) {
      const [orderExisting] = await pool.query(
        'SELECT id FROM dashboard_section_items WHERE section_id = ? AND display_order = ? AND deleted_at IS NULL LIMIT 1',
        [id, finalDisplayOrder]
      );
      if (orderExisting.length > 0) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used in this section.` });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO dashboard_section_items (
        section_id, item_type, item_id, display_order, active, starts_at, ends_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id, item_type, item_id, 
        finalDisplayOrder, 
        active !== undefined ? active : 1,
        starts_at || null,
        ends_at || null
      ]
    );

    res.status(201).json({ message: 'Dashboard section item added', id: result.insertId });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: PATCH /api/admin/dashboard-sections/:id/items/:itemId
 */
const updateAdminSectionItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { display_order, active, starts_at, ends_at } = req.body;

  const scheduleError = validateVisibilityWindow(starts_at, ends_at);
  if (scheduleError) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: scheduleError });
  }

  try {
    const [items] = await pool.query(
      'SELECT * FROM dashboard_section_items WHERE id = ? AND section_id = ? AND deleted_at IS NULL',
      [itemId, id]
    );
    if (items.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Section item not found' });
    }

    const existingItem = items[0];

    const finalDisplayOrder = display_order !== undefined ? display_order : existingItem.display_order;
    if (finalDisplayOrder > 0) {
      const [orderExisting] = await pool.query(
        'SELECT id FROM dashboard_section_items WHERE section_id = ? AND display_order = ? AND id != ? AND deleted_at IS NULL LIMIT 1',
        [id, finalDisplayOrder, itemId]
      );
      if (orderExisting.length > 0) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: `Display order ${finalDisplayOrder} is already used in this section.` });
      }
    }

    await pool.query(
      `UPDATE dashboard_section_items SET
        display_order = ?, active = ?, starts_at = ?, ends_at = ?
       WHERE id = ?`,
      [
        finalDisplayOrder,
        active !== undefined ? active : existingItem.active,
        starts_at !== undefined ? starts_at : existingItem.starts_at,
        ends_at !== undefined ? ends_at : existingItem.ends_at,
        itemId
      ]
    );

    res.status(200).json({ message: 'Section item updated' });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: DELETE /api/admin/dashboard-sections/:id/items/:itemId
 */
const deleteAdminSectionItem = async (req, res) => {
  const { id, itemId } = req.params;
  try {
    const [items] = await pool.query(
      'SELECT id FROM dashboard_section_items WHERE id = ? AND section_id = ? AND deleted_at IS NULL LIMIT 1',
      [itemId, id]
    );
    if (items.length === 0) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Section item not found' });
    }

    await pool.query(
      'UPDATE dashboard_section_items SET deleted_at = NOW() WHERE id = ?',
      [itemId]
    );
    res.status(200).json({ message: 'Section item removed' });
  } catch (error) {
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: PATCH /api/admin/dashboard-sections/reorder
 */
const reorderAdminSections = async (req, res) => {
  const { sectionIds } = req.body;
  if (!Array.isArray(sectionIds)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'sectionIds array is required' });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    for (let i = 0; i < sectionIds.length; i++) {
      const sectionId = sectionIds[i];
      await connection.query(
        'UPDATE dashboard_sections SET display_order = ? WHERE id = ? AND deleted_at IS NULL',
        [i, sectionId]
      );
    }
    await connection.commit();
    connection.release();
    res.status(200).json({ message: 'Sections reordered successfully' });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

/**
 * Admin: PATCH /api/admin/dashboard-sections/:id/items/reorder
 */
const reorderAdminSectionItems = async (req, res) => {
  const { id } = req.params;
  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'itemIds array is required' });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    for (let i = 0; i < itemIds.length; i++) {
      const itemId = itemIds[i];
      await connection.query(
        'UPDATE dashboard_section_items SET display_order = ? WHERE id = ? AND section_id = ? AND deleted_at IS NULL',
        [i, itemId, id]
      );
    }
    await connection.commit();
    connection.release();
    res.status(200).json({ message: 'Section items reordered successfully' });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

module.exports = {
  getDashboard,
  getSectionItems,
  getAdminSections,
  getAdminSectionById,
  createAdminSection,
  updateAdminSection,
  deleteAdminSection,
  addAdminSectionItem,
  updateAdminSectionItem,
  deleteAdminSectionItem,
  reorderAdminSections,
  reorderAdminSectionItems
};
