const { pool } = require('../db/mysql');
const { emitToAllCustomers } = require('../realtime/socket');

// Maps a raw shops + users JOIN row to the admin response shape. The response
// duplicates fields in both camelCase and snake_case because different clients
// read different casings (the codebase-wide response contract).
const mapShopRow = (row) => ({
  id: row.id,
  name: row.name,
  is_open: Boolean(row.is_open),
  isOpen: Boolean(row.is_open),
  active: Boolean(row.active),
  owner_user_id: row.owner_user_id ?? null,
  ownerUserId: row.owner_user_id ?? null,
  owner_name: row.owner_name ?? null,
  ownerName: row.owner_name ?? null,
  owner_phone: row.owner_phone ?? null,
  ownerPhone: row.owner_phone ?? null,
  product_count: row.product_count ?? 0,
  productCount: row.product_count ?? 0,
  created_at: row.created_at,
});

// Fetch a single shop in the admin row shape (joined with owner + product count).
const fetchShopRow = async (shopId) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.is_open, s.active, s.owner_user_id, u.name AS owner_name, u.phone AS owner_phone,
       (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.deleted = 0) AS product_count, s.created_at
     FROM shops s
     LEFT JOIN users u ON u.id = s.owner_user_id
     WHERE s.id = ?`,
    [shopId]
  );
  return rows.length > 0 ? mapShopRow(rows[0]) : null;
};

// GET /api/admin/shops — every shop (including active = 0), with owner info +
// product count.
const listShops = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.is_open, s.active, s.owner_user_id, u.name AS owner_name, u.phone AS owner_phone,
       (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.deleted = 0) AS product_count, s.created_at
     FROM shops s
     LEFT JOIN users u ON u.id = s.owner_user_id
     ORDER BY s.id ASC`
  );
  res.status(200).json({ shops: rows.map(mapShopRow) });
};

const OWNER_NOT_FOUND_MSG = 'No user with that phone. Ask the shop owner to log in to the app once (OTP signup creates the account), then assign them.';

// POST /api/admin/shops — body { name, owner_phone? }. owner_phone optional.
const createShop = async (req, res) => {
  const { name, owner_phone } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Shop name is required' });
  }
  const trimmedName = String(name).trim();

  let ownerUserId = null;
  if (owner_phone !== undefined && owner_phone !== null && String(owner_phone).trim() !== '') {
    const phone = String(owner_phone).trim();
    const [userRows] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (userRows.length === 0) {
      return res.status(404).json({ code: 'OWNER_NOT_FOUND', message: OWNER_NOT_FOUND_MSG });
    }
    ownerUserId = userRows[0].id;
    const [existing] = await pool.query(
      'SELECT id FROM shops WHERE owner_user_id = ? AND active = 1 LIMIT 1',
      [ownerUserId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ code: 'OWNER_TAKEN', message: 'That user already owns an active shop.' });
    }
  }

  const [result] = await pool.query(
    'INSERT INTO shops (name, owner_user_id) VALUES (?, ?)',
    [trimmedName, ownerUserId]
  );

  const shop = await fetchShopRow(result.insertId);
  res.status(201).json({ shop });
};

// PATCH /api/admin/shops/:id — body may contain name, owner_phone (null clears
// owner), active (bool), is_open (bool). Only provided fields update.
const updateShop = async (req, res) => {
  const { id } = req.params;
  const { name, owner_phone, active, is_open } = req.body;

  const [existing] = await pool.query('SELECT id FROM shops WHERE id = ?', [id]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
  }

  const sets = [];
  const values = [];

  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Shop name cannot be empty' });
    }
    sets.push('name = ?');
    values.push(String(name).trim());
  }

  if (owner_phone !== undefined) {
    if (owner_phone === null || String(owner_phone).trim() === '') {
      sets.push('owner_user_id = NULL');
    } else {
      const phone = String(owner_phone).trim();
      const [userRows] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
      if (userRows.length === 0) {
        return res.status(404).json({ code: 'OWNER_NOT_FOUND', message: OWNER_NOT_FOUND_MSG });
      }
      const ownerUserId = userRows[0].id;
      // Exclude the current shop so re-assigning the same owner is not a
      // false OWNER_TAKEN.
      const [taken] = await pool.query(
        'SELECT id FROM shops WHERE owner_user_id = ? AND active = 1 AND id != ? LIMIT 1',
        [ownerUserId, id]
      );
      if (taken.length > 0) {
        return res.status(409).json({ code: 'OWNER_TAKEN', message: 'That user already owns an active shop.' });
      }
      sets.push('owner_user_id = ?');
      values.push(ownerUserId);
    }
  }

  if (active !== undefined) {
    sets.push('active = ?');
    values.push(active ? 1 : 0);
  }

  if (is_open !== undefined) {
    sets.push('is_open = ?');
    values.push(is_open ? 1 : 0);
  }

  if (sets.length > 0) {
    values.push(id);
    await pool.query(`UPDATE shops SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  const shop = await fetchShopRow(id);

  // Either flag flipping to closed/inactive hides the shop's products from
  // customers — notify connected clients so open carts/screens can react
  // immediately instead of waiting for a manual refresh.
  if (is_open !== undefined || active !== undefined) {
    emitToAllCustomers('shop.status.updated', {
      shopId: shop.id,
      isOpen: Boolean(shop.is_open) && Boolean(shop.active),
    });
  }

  res.status(200).json({ message: 'Shop updated', shop });
};

module.exports = { listShops, createShop, updateShop };
