const { pool } = require('../db/mysql');

// Returns the ACTIVE shop owned by this user, or null. One shop per user
// by design (v1); if data ever contains more, the lowest id wins.
const getShopForUser = async (userId) => {
  if (!userId) return null;
  const [rows] = await pool.query(
    'SELECT id, name, is_open, active FROM shops WHERE owner_user_id = ? AND active = 1 ORDER BY id ASC LIMIT 1',
    [userId]
  );
  if (rows.length === 0) return null;
  const shop = rows[0];
  return { id: shop.id, name: shop.name, is_open: Boolean(shop.is_open), isOpen: Boolean(shop.is_open) };
};

// Fire-and-forget fan-out to the owners of every shop with items in this
// order. Never throws (callers are inside order-status paths that must not
// fail because a push failed).
const notifyShopsForOrder = async (order) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id AS shop_id, s.name AS shop_name, s.owner_user_id
       FROM order_items oi JOIN shops s ON s.id = oi.shop_id
       WHERE oi.order_id = ? AND s.active = 1 AND s.owner_user_id IS NOT NULL`,
      [order.id]
    );
    if (rows.length === 0) return;
    const { emitToCustomer } = require('../realtime/socket');
    const expoPush = require('./expoPush');
    for (const row of rows) {
      emitToCustomer(row.owner_user_id, 'shop.order.assigned', {
        orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
      });
    }
    expoPush.sendPushToMany(pool, rows.map(r => r.owner_user_id), {
      title: 'New order to prepare',
      body: `Order ${order.order_number} has items for your shop. Open the app to confirm.`,
      data: { type: 'shop_order', orderId: order.id },
    }).catch(() => {});
  } catch (e) {
    console.error('[shops] notifyShopsForOrder failed for order', order?.id, e.message);
  }
};

// Fire-and-forget fan-out when an order a shop was already preparing
// (Accepted/Preparing) gets cancelled — otherwise the order just vanishes
// from the shop owner's list with no explanation and they keep cooking it.
const notifyShopsOrderCancelled = async (order) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id AS shop_id, s.name AS shop_name, s.owner_user_id
       FROM order_items oi JOIN shops s ON s.id = oi.shop_id
       WHERE oi.order_id = ? AND s.active = 1 AND s.owner_user_id IS NOT NULL`,
      [order.id]
    );
    if (rows.length === 0) return;
    const { emitToCustomer } = require('../realtime/socket');
    const expoPush = require('./expoPush');
    for (const row of rows) {
      emitToCustomer(row.owner_user_id, 'shop.order.cancelled', {
        orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
      });
    }
    expoPush.sendPushToMany(pool, rows.map(r => r.owner_user_id), {
      title: 'Order cancelled',
      body: `Order ${order.order_number} was cancelled. Please stop preparing it.`,
      data: { type: 'shop_order', orderId: order.id },
    }).catch(() => {});
  } catch (e) {
    console.error('[shops] notifyShopsOrderCancelled failed for order', order?.id, e.message);
  }
};

// If every active multi-vendor shop is now closed, auto-close the global
// "Shop Status" banner (settings.shop_open) too, so the admin dashboard
// doesn't keep showing "Open" while every shop that could fulfil an order
// is closed. One-directional by design: re-opening any single shop does
// NOT auto-reopen the global banner — that always requires an explicit
// admin action, so a deliberate "we're fully closed" flip is never
// silently undone by one shop owner flipping back on.
// No-ops in single-vendor deployments (shops table empty/no active rows) —
// nothing to auto-close based on.
const autoCloseGlobalShopIfAllShopsClosed = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT
         SUM(active = 1) AS total_active,
         SUM(active = 1 AND is_open = 1) AS total_open
       FROM shops`
    );
    const totalActive = Number(rows[0]?.total_active) || 0;
    const totalOpen = Number(rows[0]?.total_open) || 0;
    if (totalActive === 0 || totalOpen > 0) return;

    await pool.query('UPDATE settings SET shop_open = 0 WHERE shop_open = 1');
  } catch (e) {
    console.error('[shops] autoCloseGlobalShopIfAllShopsClosed failed:', e.message);
  }
};

module.exports = {
  autoCloseGlobalShopIfAllShopsClosed,
  getShopForUser,
  notifyShopsForOrder,
  notifyShopsOrderCancelled,
};
