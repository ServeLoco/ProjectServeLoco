const { pool } = require('../db/mysql');
const { emitToAllCustomers, emitToAdmins } = require('../realtime/socket');
const { syncGlobalShopOpenState } = require('../utils/shops');
const { isActiveMobileAdminPhone } = require('../utils/mobileAdmins');
const { validateCoordinates } = require('../validators');
const {
  listShopActiveOrders,
  confirmShopOrder,
  rejectShopOrder,
  readyShopOrder,
} = require('../services/shopOrderActions');

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
  latitude: row.latitude != null ? Number(row.latitude) : null,
  longitude: row.longitude != null ? Number(row.longitude) : null,
  lat: row.latitude != null ? Number(row.latitude) : null,
  lng: row.longitude != null ? Number(row.longitude) : null,
  created_at: row.created_at,
});

// Fetch a single shop in the admin row shape (joined with owner + product count).
const fetchShopRow = async (shopId) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.is_open, s.active, s.latitude, s.longitude,
       s.owner_user_id, u.name AS owner_name, u.phone AS owner_phone,
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
    `SELECT s.id, s.name, s.is_open, s.active, s.latitude, s.longitude,
       s.owner_user_id, u.name AS owner_name, u.phone AS owner_phone,
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
  const latitude = req.body.latitude !== undefined ? req.body.latitude : req.body.lat;
  const longitude = req.body.longitude !== undefined ? req.body.longitude : req.body.lng;

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
    // D2: one phone = shop owner OR rider, not both
    const [riderRows] = await pool.query(
      'SELECT id FROM riders WHERE user_id = ? AND active = 1 LIMIT 1',
      [ownerUserId]
    );
    if (riderRows.length > 0) {
      return res.status(409).json({
        code: 'ROLE_CONFLICT',
        message: 'That user is a rider. One phone can be shop owner OR rider, not both.',
      });
    }
    if (await isActiveMobileAdminPhone(phone)) {
      return res.status(409).json({
        code: 'ROLE_CONFLICT',
        message: 'That phone is already assigned as a mobile admin. Remove or deactivate that role first.',
      });
    }
  }

  let latVal = null;
  let lngVal = null;
  if (latitude !== undefined || longitude !== undefined) {
    if (latitude === null || longitude === null || latitude === '' || longitude === '') {
      // leave null
    } else if (!validateCoordinates(latitude, longitude)) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid latitude/longitude' });
    } else {
      latVal = Number(latitude);
      lngVal = Number(longitude);
    }
  }

  const [result] = await pool.query(
    'INSERT INTO shops (name, owner_user_id, latitude, longitude) VALUES (?, ?, ?, ?)',
    [trimmedName, ownerUserId, latVal, lngVal]
  );

  const shop = await fetchShopRow(result.insertId);
  res.status(201).json({ shop });
};

// PATCH /api/admin/shops/:id — body may contain name, owner_phone (null clears
// owner), active (bool), is_open (bool). Only provided fields update.
const updateShop = async (req, res) => {
  const { id } = req.params;
  const { name, owner_phone, active, is_open } = req.body;
  const latitude = req.body.latitude !== undefined ? req.body.latitude : req.body.lat;
  const longitude = req.body.longitude !== undefined ? req.body.longitude : req.body.lng;

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
      const [riderRows] = await pool.query(
        'SELECT id FROM riders WHERE user_id = ? AND active = 1 LIMIT 1',
        [ownerUserId]
      );
      if (riderRows.length > 0) {
        return res.status(409).json({
          code: 'ROLE_CONFLICT',
          message: 'That user is a rider. One phone can be shop owner OR rider, not both.',
        });
      }
      if (await isActiveMobileAdminPhone(phone)) {
        return res.status(409).json({
          code: 'ROLE_CONFLICT',
          message: 'That phone is already assigned as a mobile admin. Remove or deactivate that role first.',
        });
      }
      sets.push('owner_user_id = ?');
      values.push(ownerUserId);
    }
  }

  let deactivatedOwnerUserId = null;
  if (active !== undefined) {
    sets.push('active = ?');
    values.push(active ? 1 : 0);
    if (!active) {
      // Capture owner so we can demote their live session to customer mode.
      const [ownerRows] = await pool.query(
        'SELECT owner_user_id FROM shops WHERE id = ? LIMIT 1',
        [id]
      );
      deactivatedOwnerUserId = ownerRows[0]?.owner_user_id || null;
    }
  }

  if (is_open !== undefined) {
    sets.push('is_open = ?');
    values.push(is_open ? 1 : 0);
  }

  if (latitude !== undefined || longitude !== undefined) {
    const latProvided = latitude !== undefined;
    const lngProvided = longitude !== undefined;
    if (latProvided !== lngProvided) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'latitude and longitude must be provided together (or both null to clear)',
      });
    }
    if (latitude === null || longitude === null || latitude === '' || longitude === '') {
      sets.push('latitude = NULL', 'longitude = NULL');
    } else if (!validateCoordinates(latitude, longitude)) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid latitude/longitude',
      });
    } else {
      sets.push('latitude = ?', 'longitude = ?');
      values.push(Number(latitude), Number(longitude));
    }
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
    const isOpen = Boolean(shop.is_open) && Boolean(shop.active);
    emitToAllCustomers('shop.status.updated', {
      shopId: shop.id,
      isOpen,
    });
    // Other admin dashboards (or this same admin in another tab) need this
    // too — otherwise their Shops table goes stale until manual refresh.
    try {
      emitToAdmins('admin.shop.updated', {
        shopId: shop.id,
        id: shop.id,
        isOpen: Boolean(shop.is_open),
        is_open: Boolean(shop.is_open),
        active: Boolean(shop.active),
      });
    } catch (_) { /* best-effort */ }
    // Keep the global "Shop Status" banner in sync in both directions —
    // see syncGlobalShopOpenState.
    await syncGlobalShopOpenState();
    require('../utils/microCache').bust('dashboard');
    require('../utils/microCache').bust('categories');
  }

  // Admin kill-switch (active=false) → owner phone becomes customer mode.
  if (deactivatedOwnerUserId) {
    try {
      const { emitToCustomer } = require('../realtime/socket');
      emitToCustomer(deactivatedOwnerUserId, 'auth.role.updated', {
        shop: null,
        reason: 'shop_deactivated',
      });
    } catch (_) { /* best-effort */ }
  }

  res.status(200).json({ message: 'Shop updated', shop });
};

// DELETE /api/admin/shops/:id — remove a shop from the platform.
// Products are NOT deleted: they move to the default "home" catalogue
// (shop_id = NULL, house items). group_id is cleared because product_groups
// cascade-delete with the shop. Blocks if the shop still has non-terminal
// orders so riders/customers are not left mid-delivery.
// Owner phone is freed → next /auth/me has shop=null → customer mode.
const deleteShop = async (req, res) => {
  const { id } = req.params;
  const shopId = Number(id);
  if (!Number.isFinite(shopId) || shopId <= 0) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid shop id' });
  }

  const [existing] = await pool.query(
    'SELECT id, name, owner_user_id FROM shops WHERE id = ?',
    [shopId]
  );
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
  }
  const ownerUserId = existing[0].owner_user_id || null;

  const [[activeOrders]] = await pool.query(
    `SELECT COUNT(DISTINCT o.id) AS cnt
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.shop_id = ?
       AND o.status NOT IN ('Delivered', 'Cancelled', 'Canceled')`,
    [shopId]
  );
  if (Number(activeOrders?.cnt || 0) > 0) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Cannot delete shop while it still has active orders. Finish or cancel them first.',
    });
  }

  // Reassign catalogue to house (default home) instead of soft-deleting.
  // Clear group_id first so orphaned group refs do not survive cascade delete
  // of product_groups when the shop row is removed.
  const [reassignResult] = await pool.query(
    `UPDATE products
     SET shop_id = NULL, group_id = NULL
     WHERE shop_id = ?`,
    [shopId]
  );
  const productsReassigned = Number(reassignResult?.affectedRows || 0);

  // product_groups.shop_id has ON DELETE CASCADE — groups go with the shop.
  await pool.query('DELETE FROM shops WHERE id = ?', [shopId]);

  emitToAllCustomers('shop.status.updated', {
    shopId,
    isOpen: false,
  });
  try {
    emitToAdmins('admin.shop.updated', { shopId, id: shopId, deleted: true });
  } catch (_) { /* best-effort */ }
  // Owner phone is no longer a shop owner — open app switches to customer shell.
  if (ownerUserId) {
    try {
      const { emitToCustomer } = require('../realtime/socket');
      emitToCustomer(ownerUserId, 'auth.role.updated', {
        shop: null,
        reason: 'shop_deleted',
      });
    } catch (_) { /* best-effort */ }
  }
  await syncGlobalShopOpenState();
  require('../utils/microCache').bust('dashboard');
  require('../utils/microCache').bust('categories');

  res.status(200).json({
    message: 'Shop deleted',
    shopId,
    shop_id: shopId,
    ownerUserId,
    owner_user_id: ownerUserId,
    becomesCustomer: Boolean(ownerUserId),
    becomes_customer: Boolean(ownerUserId),
    productsReassigned,
    products_reassigned: productsReassigned,
  });
};

// GET /api/admin/shops/:id/orders — same active-order shape as shop owner
// GET /api/shop/orders (Accepted/Preparing with this shop's items only).
const listShopOrders = async (req, res) => {
  const shopId = Number(req.params.id);
  const [existing] = await pool.query('SELECT id, name FROM shops WHERE id = ?', [shopId]);
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
  }
  const orders = await listShopActiveOrders(shopId);
  res.status(200).json({
    shopId,
    shop_id: shopId,
    shopName: existing[0].name,
    shop_name: existing[0].name,
    orders,
  });
};

const loadShopOr404 = async (shopId) => {
  const [rows] = await pool.query('SELECT id, name FROM shops WHERE id = ?', [shopId]);
  return rows[0] || null;
};

// PATCH /api/admin/shops/:id/orders/:orderId/confirm — same effect as shop owner Confirm.
const adminConfirmShopOrder = async (req, res) => {
  const shopId = Number(req.params.id);
  const { orderId } = req.params;
  const shop = await loadShopOr404(shopId);
  if (!shop) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
  }
  const result = await confirmShopOrder(shopId, orderId, { shopName: shop.name });
  if (!result.ok) {
    return res.status(result.status).json({ code: result.code, message: result.message });
  }
  res.status(200).json({ message: result.message });
};

// PATCH /api/admin/shops/:id/orders/:orderId/reject — same as shop owner Reject/Cancel.
const adminRejectShopOrder = async (req, res) => {
  const shopId = Number(req.params.id);
  const { orderId } = req.params;
  const shop = await loadShopOr404(shopId);
  if (!shop) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
  }
  const result = await rejectShopOrder(shopId, orderId, { shopName: shop.name });
  if (!result.ok) {
    return res.status(result.status).json({ code: result.code, message: result.message });
  }
  res.status(200).json({ message: result.message });
};

// PATCH /api/admin/shops/:id/orders/:orderId/ready — same as shop owner Ready.
const adminReadyShopOrder = async (req, res) => {
  const shopId = Number(req.params.id);
  const { orderId } = req.params;
  const shop = await loadShopOr404(shopId);
  if (!shop) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Shop not found' });
  }
  const result = await readyShopOrder(shopId, orderId, { shopName: shop.name });
  if (!result.ok) {
    return res.status(result.status).json({ code: result.code, message: result.message });
  }
  res.status(200).json({ message: result.message });
};

module.exports = {
  listShops,
  createShop,
  updateShop,
  deleteShop,
  listShopOrders,
  adminConfirmShopOrder,
  adminRejectShopOrder,
  adminReadyShopOrder,
};
