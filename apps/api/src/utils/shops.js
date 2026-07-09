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

module.exports = { getShopForUser, notifyShopsForOrder };
