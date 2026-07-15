const { pool } = require('../db/mysql');
const { syncGlobalShopOpenState } = require('../utils/shops');
const { emitToAllCustomers, emitToAdmins } = require('../realtime/socket');
const {
  listShopActiveOrders,
  confirmShopOrder,
  rejectShopOrder,
  readyShopOrder,
} = require('../services/shopOrderActions');

const shopShape = (s) => ({
  id: s.id,
  name: s.name,
  is_open: Boolean(s.is_open),
  isOpen: Boolean(s.is_open),
  active: Boolean(s.active),
});

// GET /me — the owner's own shop.
const getMyShop = async (req, res) => {
  res.status(200).json({ shop: shopShape(req.shop) });
};

// PATCH /me/toggle — open/close the shop. body { is_open } (isOpen accepted too).
// Closing is blocked while the shop still has active orders (Accepted/
// Preparing, not yet rejected) — the owner must finish or cancel them first.
const toggleMyShop = async (req, res) => {
  const isOpen = req.body.is_open !== undefined ? req.body.is_open : req.body.isOpen;
  if (typeof isOpen !== 'boolean') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'is_open (boolean) is required' });
  }

  if (!isOpen) {
    const [activeRows] = await pool.query(
      `SELECT COUNT(DISTINCT o.id) as cnt
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.shop_id = ? AND o.status IN ('Accepted', 'Preparing') AND oi.shop_rejected_at IS NULL`,
      [req.shop.id]
    );
    if (activeRows[0].cnt > 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Cannot close the shop while you have active orders. Finish or cancel them first.',
      });
    }
  }

  await pool.query('UPDATE shops SET is_open = ? WHERE id = ?', [isOpen ? 1 : 0, req.shop.id]);
  const [rows] = await pool.query('SELECT id, name, is_open, active FROM shops WHERE id = ?', [req.shop.id]);
  emitToAllCustomers('shop.status.updated', { shopId: req.shop.id, isOpen: Boolean(isOpen) });
  // Admin dashboard's Shops table has no other way to learn a shop owner
  // toggled their own shop — keep it in sync the same way rider toggles do.
  try {
    emitToAdmins('admin.shop.updated', {
      shopId: req.shop.id,
      id: req.shop.id,
      isOpen: Boolean(isOpen),
      is_open: Boolean(isOpen),
      active: Boolean(rows[0]?.active),
    });
  } catch (_) { /* best-effort */ }
  // Keep the global "Shop Status" banner in sync — opening this shop can
  // auto-turn it on (if delivery is available), closing it can auto-turn
  // it off (if this was the last open shop). See syncGlobalShopOpenState.
  await syncGlobalShopOpenState();
  // Products from this shop appear/disappear on dashboard even when global
  // shop_open is unchanged — bust micro-cache.
  require('../utils/microCache').bust('dashboard');
  require('../utils/microCache').bust('categories');
  res.status(200).json({ message: 'Shop updated', shop: shopShape(rows[0]) });
};

// GET /products — this shop's non-deleted products, available as a boolean,
// with group membership and variants so the Products screen doesn't need
// extra calls.
const getMyProducts = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.price, p.unit, p.image_id, p.available, p.group_id, pg.name AS group_name
     FROM products p
     LEFT JOIN product_groups pg ON pg.id = p.group_id
     WHERE p.shop_id = ? AND p.deleted = 0
     ORDER BY p.name ASC`,
    [req.shop.id]
  );

  const productIds = rows.map(p => p.id);
  const [variantRows] = productIds.length > 0
    ? await pool.query(
        `SELECT id, product_id, label, price, available, is_default
         FROM product_variants
         WHERE product_id IN (?) AND deleted = 0
         ORDER BY display_order ASC`,
        [productIds]
      )
    : [[]];

  const variantsByProduct = variantRows.reduce((map, v) => {
    if (!map[v.product_id]) map[v.product_id] = [];
    map[v.product_id].push({
      id: v.id,
      label: v.label,
      price: v.price,
      available: Boolean(v.available),
      isDefault: Boolean(v.is_default),
    });
    return map;
  }, {});

  const products = rows.map(p => ({
    ...p,
    available: Boolean(p.available),
    groupId: p.group_id,
    groupName: p.group_name,
    variants: variantsByProduct[p.id] || [],
  }));
  res.status(200).json({ products });
};

// PATCH /products/:id/toggle — flip a product's availability. Scoped to this
// shop so a wrong-shop/unknown id both surface as 404 (not distinguished).
const toggleMyProduct = async (req, res) => {
  const available = req.body.available !== undefined ? req.body.available : req.body.isAvailable;
  if (typeof available !== 'boolean') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'available (boolean) is required' });
  }
  const productId = Number(req.params.id);
  const isAvailable = Boolean(available);
  const [result] = await pool.query(
    'UPDATE products SET available = ? WHERE id = ? AND shop_id = ? AND deleted = 0',
    [isAvailable ? 1 : 0, productId, req.shop.id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }
  // Customers listening on dashboard/cart drop OOS lines live (and re-show when
  // the shop marks the item available again via silent catalog refresh).
  emitToAllCustomers('product.availability.updated', {
    productId,
    id: productId,
    available: isAvailable,
    shopId: req.shop.id,
  });
  res.status(200).json({ message: 'Product updated', productId, available: isAvailable });
};

// GET /orders — orders with ≥1 of this shop's items and status Accepted/Preparing.
// Only this shop's items are returned; no prices, address, phone, or totals.
// Includes expectedMinutes (from settings, keyed by the order's delivery_type)
// so the shop-owner popup can show "Fast — 20min" / "Standard — 55min"
// without a second round trip. Rejected orders are NOT filtered out — the
// owner's dashboard shows them in a "rejected, waiting on admin" state.
const getMyOrders = async (req, res) => {
  const orders = await listShopActiveOrders(req.shop.id);
  res.status(200).json({ orders });
};

// GET /orders/history — every order this shop has ever had items on,
// any status, most recent first. Unlike getMyOrders (scoped to
// Accepted/Preparing for the live dashboard queue), this is the full order
// list for the "Orders" tab. Capped at 100 rows — this is a recent-history
// view, not a paginated report.
const getMyOrderHistory = async (req, res) => {
  const [orders] = await pool.query(
    `SELECT DISTINCT o.id, o.order_number, o.status, o.note, o.created_at, o.delivery_type
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.shop_id = ?
     ORDER BY o.created_at DESC
     LIMIT 100`,
    [req.shop.id]
  );

  if (orders.length === 0) {
    return res.status(200).json({ orders: [] });
  }

  const orderIds = orders.map(o => o.id);
  const [items] = await pool.query(
    'SELECT id, order_id, product_name, quantity, variant_label, shop_confirmed_at, shop_rejected_at, shop_ready_at FROM order_items WHERE shop_id = ? AND order_id IN (?)',
    [req.shop.id, orderIds]
  );

  const itemsByOrder = items.reduce((map, it) => {
    if (!map[it.order_id]) map[it.order_id] = [];
    map[it.order_id].push(it);
    return map;
  }, {});

  const result = orders.map(o => {
    const myItems = itemsByOrder[o.id] || [];
    const confirmed = myItems.length > 0 && myItems.every(it => it.shop_confirmed_at !== null);
    const rejected = myItems.length > 0 && myItems.every(it => it.shop_rejected_at !== null);
    const ready = myItems.length > 0 && myItems.every(it => it.shop_ready_at !== null);
    return {
      id: o.id,
      orderNumber: o.order_number,
      order_number: o.order_number,
      status: o.status,
      note: o.note,
      createdAt: o.created_at,
      created_at: o.created_at,
      deliveryType: o.delivery_type,
      delivery_type: o.delivery_type,
      confirmed,
      rejected,
      ready,
      items: myItems.map(it => ({
        id: it.id,
        productName: it.product_name,
        product_name: it.product_name,
        quantity: it.quantity,
        variantLabel: it.variant_label,
        variant_label: it.variant_label,
      })),
    };
  });

  res.status(200).json({ orders: result });
};

// PATCH /orders/:orderId/confirm — mark this shop's items as confirmed.
// Idempotent: re-confirming already-confirmed items is a no-op (still 200).
const confirmMyOrder = async (req, res) => {
  const result = await confirmShopOrder(req.shop.id, req.params.orderId, {
    shopName: req.shop.name,
  });
  if (!result.ok) {
    return res.status(result.status).json({ code: result.code, message: result.message });
  }
  res.status(200).json({ message: result.message });
};

// PATCH /orders/:orderId/reject — mark this shop's items as rejected.
// Does NOT touch orders.status (informational, same as confirm) — instead
// writes a persistent admin inbox notification so the admin can act (cancel,
// reassign, contact customer). Idempotent, same status guard as confirm.
const rejectMyOrder = async (req, res) => {
  const result = await rejectShopOrder(req.shop.id, req.params.orderId, {
    shopName: req.shop.name,
  });
  if (!result.ok) {
    return res.status(result.status).json({ code: result.code, message: result.message });
  }
  res.status(200).json({ message: result.message });
};

// PATCH /orders/:orderId/ready — mark this shop's items ready for pickup.
// Requires the shop to have already confirmed the order. Idempotent, same
// status guard as confirm/reject. Informational for the admin.
const readyMyOrder = async (req, res) => {
  const result = await readyShopOrder(req.shop.id, req.params.orderId, {
    shopName: req.shop.name,
  });
  if (!result.ok) {
    return res.status(result.status).json({ code: result.code, message: result.message });
  }
  res.status(200).json({ message: result.message });
};

const groupShape = (g) => ({
  id: g.id,
  name: g.name,
  active: Boolean(g.active),
  isActive: Boolean(g.active),
  productCount: g.product_count ?? 0,
  product_count: g.product_count ?? 0,
});

// GET /groups — this shop's product groups with member counts.
const getMyGroups = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pg.id, pg.name, pg.active,
       (SELECT COUNT(*) FROM products p WHERE p.group_id = pg.id AND p.deleted = 0) AS product_count
     FROM product_groups pg
     WHERE pg.shop_id = ?
     ORDER BY pg.name ASC`,
    [req.shop.id]
  );
  res.status(200).json({ groups: rows.map(groupShape) });
};

// POST /groups — body { name }.
const createMyGroup = async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Group name is required' });
  }
  const [result] = await pool.query(
    'INSERT INTO product_groups (shop_id, name) VALUES (?, ?)',
    [req.shop.id, String(name).trim()]
  );
  const [rows] = await pool.query(
    'SELECT id, name, active, 0 AS product_count FROM product_groups WHERE id = ?',
    [result.insertId]
  );
  res.status(201).json({ group: groupShape(rows[0]) });
};

// PATCH /groups/:id — body may contain name and/or active. Scoped to this
// shop — a group id from another shop 404s, never trusted by id alone.
const updateMyGroup = async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;

  const [existing] = await pool.query(
    'SELECT id FROM product_groups WHERE id = ? AND shop_id = ?',
    [id, req.shop.id]
  );
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' });
  }

  const sets = [];
  const values = [];
  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Group name cannot be empty' });
    }
    sets.push('name = ?');
    values.push(String(name).trim());
  }
  if (active !== undefined) {
    sets.push('active = ?');
    values.push(active ? 1 : 0);
  }
  if (sets.length > 0) {
    values.push(id);
    await pool.query(`UPDATE product_groups SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  const [rows] = await pool.query(
    `SELECT pg.id, pg.name, pg.active,
       (SELECT COUNT(*) FROM products p WHERE p.group_id = pg.id AND p.deleted = 0) AS product_count
     FROM product_groups pg WHERE pg.id = ?`,
    [id]
  );
  res.status(200).json({ message: 'Group updated', group: groupShape(rows[0]) });
};

// DELETE /groups/:id — member products become ungrouped, not deleted.
const deleteMyGroup = async (req, res) => {
  const { id } = req.params;
  const [existing] = await pool.query(
    'SELECT id FROM product_groups WHERE id = ? AND shop_id = ?',
    [id, req.shop.id]
  );
  if (existing.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Group not found' });
  }
  await pool.query('UPDATE products SET group_id = NULL WHERE group_id = ?', [id]);
  await pool.query('DELETE FROM product_groups WHERE id = ?', [id]);
  res.status(200).json({ message: 'Group deleted' });
};

// PATCH /products/:id/group — body { group_id } (null clears it). Validates
// the group belongs to this shop when non-null.
const assignMyProductGroup = async (req, res) => {
  const { id } = req.params;
  const groupId = req.body.group_id !== undefined ? req.body.group_id : req.body.groupId;

  if (groupId !== null && groupId !== undefined) {
    const [groupRows] = await pool.query(
      'SELECT id FROM product_groups WHERE id = ? AND shop_id = ?',
      [groupId, req.shop.id]
    );
    if (groupRows.length === 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Unknown group_id' });
    }
  }

  const [result] = await pool.query(
    'UPDATE products SET group_id = ? WHERE id = ? AND shop_id = ? AND deleted = 0',
    [groupId || null, id, req.shop.id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }
  res.status(200).json({ message: 'Product group updated' });
};

module.exports = {
  getMyShop,
  toggleMyShop,
  getMyProducts,
  toggleMyProduct,
  getMyOrders,
  getMyOrderHistory,
  confirmMyOrder,
  rejectMyOrder,
  readyMyOrder,
  getMyGroups,
  createMyGroup,
  updateMyGroup,
  deleteMyGroup,
  assignMyProductGroup,
};
