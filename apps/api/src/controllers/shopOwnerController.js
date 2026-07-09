const { pool } = require('../db/mysql');
const { emitToAdmins } = require('../realtime/socket');

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
const toggleMyShop = async (req, res) => {
  const isOpen = req.body.is_open !== undefined ? req.body.is_open : req.body.isOpen;
  if (typeof isOpen !== 'boolean') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'is_open (boolean) is required' });
  }
  await pool.query('UPDATE shops SET is_open = ? WHERE id = ?', [isOpen ? 1 : 0, req.shop.id]);
  const [rows] = await pool.query('SELECT id, name, is_open, active FROM shops WHERE id = ?', [req.shop.id]);
  res.status(200).json({ message: 'Shop updated', shop: shopShape(rows[0]) });
};

// GET /products — this shop's non-deleted products, available as a boolean.
const getMyProducts = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, price, unit, image_id, available FROM products WHERE shop_id = ? AND deleted = 0 ORDER BY name ASC',
    [req.shop.id]
  );
  const products = rows.map(p => ({ ...p, available: Boolean(p.available) }));
  res.status(200).json({ products });
};

// PATCH /products/:id/toggle — flip a product's availability. Scoped to this
// shop so a wrong-shop/unknown id both surface as 404 (not distinguished).
const toggleMyProduct = async (req, res) => {
  const available = req.body.available !== undefined ? req.body.available : req.body.isAvailable;
  if (typeof available !== 'boolean') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'available (boolean) is required' });
  }
  const [result] = await pool.query(
    'UPDATE products SET available = ? WHERE id = ? AND shop_id = ? AND deleted = 0',
    [available ? 1 : 0, req.params.id, req.shop.id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Product not found' });
  }
  res.status(200).json({ message: 'Product updated' });
};

// GET /orders — orders with ≥1 of this shop's items and status Accepted/Preparing.
// Only this shop's items are returned; no prices, address, phone, or totals.
const getMyOrders = async (req, res) => {
  const [orders] = await pool.query(
    `SELECT DISTINCT o.id, o.order_number, o.status, o.note, o.created_at
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.shop_id = ? AND o.status IN ('Accepted','Preparing')
     ORDER BY o.created_at ASC`,
    [req.shop.id]
  );

  if (orders.length === 0) {
    return res.status(200).json({ orders: [] });
  }

  const orderIds = orders.map(o => o.id);
  const [items] = await pool.query(
    'SELECT id, order_id, product_name, quantity, variant_label, shop_confirmed_at FROM order_items WHERE shop_id = ? AND order_id IN (?)',
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
    return {
      id: o.id,
      orderNumber: o.order_number,
      order_number: o.order_number,
      status: o.status,
      note: o.note,
      createdAt: o.created_at,
      created_at: o.created_at,
      confirmed,
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
  const { orderId } = req.params;

  const [countRows] = await pool.query(
    'SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ? AND shop_id = ?',
    [orderId, req.shop.id]
  );
  if (countRows[0].cnt === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order has no items for your shop' });
  }

  await pool.query(
    'UPDATE order_items SET shop_confirmed_at = NOW() WHERE order_id = ? AND shop_id = ? AND shop_confirmed_at IS NULL',
    [orderId, req.shop.id]
  );

  emitToAdmins('admin.order.shop_confirmed', {
    orderId: Number(orderId),
    shopId: req.shop.id,
    shopName: req.shop.name,
  });

  res.status(200).json({ message: 'Order confirmed' });
};

module.exports = {
  getMyShop,
  toggleMyShop,
  getMyProducts,
  toggleMyProduct,
  getMyOrders,
  confirmMyOrder,
};
