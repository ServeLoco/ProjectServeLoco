const { pool } = require('../db/mysql');
const { invalidateStoreModeCache } = require('../utils/storeMode');

const RESERVED_SLUGS = new Set(['all']);
const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,30}$/;

// Public endpoint: GET /api/store-modes — active modes for the customer/web capsule.
const getStoreModes = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, slug, label, display_order FROM store_modes WHERE active = TRUE ORDER BY display_order ASC, id ASC'
  );
  res.status(200).json({ data: rows, storeModes: rows });
};

// Admin endpoint: GET /api/admin/store-modes — all modes including inactive.
const getAdminStoreModes = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM store_modes ORDER BY display_order ASC, id ASC'
  );
  res.status(200).json({ data: rows });
};

const createStoreMode = async (req, res) => {
  const { slug, label } = req.body;
  const cleanSlug = String(slug || '').trim().toLowerCase();
  const cleanLabel = String(label || '').trim();

  if (!SLUG_PATTERN.test(cleanSlug)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Slug must be lowercase letters, numbers, and underscores, starting with a letter (2-31 chars)' });
  }
  if (RESERVED_SLUGS.has(cleanSlug)) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `"${cleanSlug}" is a reserved value and cannot be used as a mode slug` });
  }
  if (!cleanLabel) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Label is required' });
  }

  const [[existing]] = await pool.query('SELECT id FROM store_modes WHERE slug = ?', [cleanSlug]);
  if (existing) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `A mode with slug "${cleanSlug}" already exists` });
  }

  const [[{ maxOrder }]] = await pool.query('SELECT COALESCE(MAX(display_order), 0) as maxOrder FROM store_modes');

  const [result] = await pool.query(
    'INSERT INTO store_modes (slug, label, display_order, active, is_system) VALUES (?, ?, ?, TRUE, FALSE)',
    [cleanSlug, cleanLabel, Number(maxOrder) + 1]
  );
  invalidateStoreModeCache();
  res.status(201).json({ message: 'Store mode created', id: result.insertId });
};

const updateStoreMode = async (req, res) => {
  const { id } = req.params;
  const { label, display_order, active } = req.body;

  const [[existing]] = await pool.query('SELECT * FROM store_modes WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Store mode not found' });
  }

  if (existing.is_system && active === false) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: `"${existing.label}" is a system mode and cannot be deactivated` });
  }

  if (active === false) {
    const [[usage]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM categories WHERE type = ? AND deleted = 0) +
        (SELECT COUNT(*) FROM combos WHERE store_type = ? AND deleted = 0) +
        (SELECT COUNT(*) FROM offers WHERE store_type = ? AND deleted = 0) as count`,
      [existing.slug, existing.slug, existing.slug]
    );
    if (Number(usage.count) > 0 && !req.body.force) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: `${usage.count} categories/combos/offers still use "${existing.label}". Pass force=true to deactivate anyway (existing items keep their mode; customers will stop seeing this mode).`
      });
    }
  }

  const updates = [];
  const params = [];
  if (label !== undefined) {
    const cleanLabel = String(label).trim();
    if (!cleanLabel) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Label cannot be empty' });
    }
    updates.push('label = ?');
    params.push(cleanLabel);
  }
  if (display_order !== undefined) {
    const order = Number(display_order);
    if (!Number.isInteger(order) || order < 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'display_order must be a non-negative integer' });
    }
    updates.push('display_order = ?');
    params.push(order);
  }
  if (active !== undefined) {
    updates.push('active = ?');
    params.push(active ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'No valid fields provided' });
  }

  params.push(id);
  await pool.query(`UPDATE store_modes SET ${updates.join(', ')} WHERE id = ?`, params);
  invalidateStoreModeCache();
  res.status(200).json({ message: 'Store mode updated' });
};

module.exports = {
  getStoreModes,
  getAdminStoreModes,
  createStoreMode,
  updateStoreMode
};
