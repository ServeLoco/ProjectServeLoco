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
// "Shop Status" banner (settings.shop_open) too — so the admin dashboard
// tracks reality instead of needing a separate manual flip every time a
// shop opens or closes. delivery_available is the master gate: if it's
// off, shop_open is forced closed no matter how many shops are open (the
// business isn't delivering, full stop — products still show in the menu,
// they just can't be ordered). If delivery_available is on, shop_open
// tracks whether any active shop is currently open.
// No-ops in single-vendor deployments (shops table empty/no active rows) —
// delivery_available is the sole gate there, and settingsController already
// respects it directly on manual shop_open writes.
const syncGlobalShopOpenState = async () => {
  try {
    let changed = false;
    let globalOpen = null;

    const [settingsRows] = await pool.query('SELECT delivery_available FROM settings LIMIT 1');
    if (settingsRows.length === 0) return;

    const deliveryAvailable = Boolean(settingsRows[0].delivery_available);
    if (!deliveryAvailable) {
      const [result] = await pool.query('UPDATE settings SET shop_open = 0 WHERE shop_open = 1');
      changed = result.affectedRows > 0;
      globalOpen = false;
    } else {
      const [shopRows] = await pool.query(
        `SELECT
           SUM(active = 1) AS total_active,
           SUM(active = 1 AND is_open = 1) AS total_open
         FROM shops`
      );
      const totalActive = Number(shopRows[0]?.total_active) || 0;
      if (totalActive === 0) return;

      const totalOpen = Number(shopRows[0]?.total_open) || 0;
      const desiredOpen = totalOpen > 0 ? 1 : 0;
      const [result] = await pool.query('UPDATE settings SET shop_open = ? WHERE shop_open != ?', [desiredOpen, desiredOpen]);
      changed = result.affectedRows > 0;
      globalOpen = Boolean(desiredOpen);
    }

    if (changed) {
      // The public /api/settings response is served from a 15s TTL cache
      // that only updateSettings normally busts — clear it here too, or the
      // customer app keeps reading the stale shop_open we just changed.
      // Lazy require: settingsController requires this file at load time,
      // so a top-level require here would be a circular import.
      const { bustSettingsCache } = require('../controllers/settingsController');
      bustSettingsCache();

      // Let connected customer apps flip their "shop closed" banner
      // immediately instead of waiting for the next settings poll.
      const { emitToAllCustomers } = require('../realtime/socket');
      emitToAllCustomers('settings.shop_open.updated', { shopOpen: globalOpen, shop_open: globalOpen });
    }
  } catch (e) {
    console.error('[shops] syncGlobalShopOpenState failed:', e.message);
  }
};

module.exports = {
  getShopForUser,
  notifyShopsForOrder,
  syncGlobalShopOpenState,
  notifyShopsOrderCancelled,
};
