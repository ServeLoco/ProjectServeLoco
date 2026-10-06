/**
 * Shared shop-order lifecycle actions used by:
 *   - shop owner routes (PATCH /api/shop/orders/:orderId/{confirm,reject,ready})
 *   - admin routes (PATCH /api/admin/shops/:shopId/orders/:orderId/{confirm,reject,ready})
 *
 * Same DB writes + side effects either way so admin "Confirm" dismisses the
 * shop-owner Accept popup (shop.order.updated → refetch).
 */
const { pool } = require('../db/mysql');
const { maybeAutoCancelOrderWhenAllShopsRejected } = require('../utils/shops');
const { emitToAdmins, emitToCustomer } = require('../realtime/socket');
const notificationService = require('../utils/notificationService');
const realtimeEvents = require('../realtime/orderEvents');
const logger = require('../utils/logger');
const { shopAlerts: shopAlertGate } = require('../realtime/sweepGates');

const { saveOrderBilling, isBillableItem } = require('./orderBilling');
const config = require('../config/env');

const ACTIVE_ORDER_STATUSES = ['Accepted', 'Preparing'];

/** Notify the shop owner (if any) so their app can refresh queue/popup. */
async function notifyShopOwnerOrderUpdated(shopId, orderId, action) {
  try {
    const [rows] = await pool.query(
      'SELECT owner_user_id FROM shops WHERE id = ? AND active = 1 AND owner_user_id IS NOT NULL LIMIT 1',
      [shopId]
    );
    if (rows.length === 0 || !rows[0].owner_user_id) return;
    emitToCustomer(rows[0].owner_user_id, 'shop.order.updated', {
      orderId: Number(orderId),
      shopId: Number(shopId),
      action,
    });
  } catch (e) {
    logger.error('[shop-order] notifyShopOwnerOrderUpdated failed:', e.message);
  }
}

/**
 * Tell the order's assigned rider (if any) that a shop changed its part.
 * Offers only go out once every shop has decided, but a shop can still be
 * auto-rejected or re-sent by an admin after a rider took the order; their
 * job card and map refetch on this event (no order in the payload), so a
 * shop that rejected drops off the route without the rider reopening it.
 */
async function notifyAssignedRiderShopChanged(shopId, orderId, action) {
  try {
    const [rows] = await pool.query(
      `SELECT r.user_id FROM orders o
       JOIN riders r ON r.id = o.rider_id
       WHERE o.id = ?`,
      [orderId]
    );
    if (!rows[0]?.user_id) return;
    emitToCustomer(rows[0].user_id, 'rider.assignment.updated', {
      orderId: Number(orderId),
      order_id: Number(orderId),
      shopId: Number(shopId),
      shop_id: Number(shopId),
      reason: `shop_${action}`,
    });
  } catch (e) {
    logger.error('[shop-order] notifyAssignedRiderShopChanged failed:', e.message);
  }
}

// Serialise every shop decision with payment/status edits on the order row.
async function changeShopDecision(shopId, orderId, action, { source } = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order || !ACTIVE_ORDER_STATUSES.includes(order.status)) {
      await connection.rollback();
      return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Order is no longer awaiting shop decisions' };
    }
    const [items] = await connection.query('SELECT * FROM order_items WHERE order_id = ? AND shop_id = ? FOR UPDATE', [orderId, shopId]);
    if (!items.length || (action === 'resent' && !items.some(it => it.shop_rejected_at != null))) {
      await connection.rollback();
      return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No matching items for this shop on this order' };
    }
    if (action === 'confirmed' && items.some(it => it.shop_rejected_at != null)) {
      await connection.rollback();
      return { ok: false, status: 409, code: 'CONCURRENCY_CONFLICT', message: 'Resend this rejected shop before accepting it' };
    }
    // A sweeper candidate can be stale by the time it obtains this lock.
    // Recheck both the decision and the current resend deadline in MySQL.
    if (source === 'timeout') {
      const [[eligible]] = await connection.query(`SELECT COUNT(*) AS cnt FROM order_items
        WHERE order_id = ? AND shop_id = ? AND shop_confirmed_at IS NULL AND shop_rejected_at IS NULL
          AND COALESCE(shop_requested_at, ?) <= NOW() - INTERVAL ? SECOND`,
      [orderId, shopId, order.accepted_at, Math.ceil((config.SHOP_RESPONSE_TIMEOUT_MS || 600000) / 1000)]);
      if (Number(eligible.cnt) !== items.length) {
        await connection.rollback();
        return { ok: false, status: 409, code: 'CONCURRENCY_CONFLICT', message: 'Shop decision or response deadline has changed' };
      }
    }
    const decisionSql = {
      confirmed: 'shop_confirmed_at = COALESCE(shop_confirmed_at, NOW()), shop_billable = 1',
      rejected: 'shop_rejected_at = COALESCE(shop_rejected_at, NOW()), shop_billable = 0',
      resent: 'shop_confirmed_at = NULL, shop_rejected_at = NULL, shop_ready_at = NULL, shop_alert_acked_at = NULL, shop_requested_at = NOW(), shop_last_notified_at = NULL, shop_notify_count = 0, shop_billable = 0',
    }[action];
    await connection.query(`UPDATE order_items SET ${decisionSql} WHERE order_id = ? AND shop_id = ?`, [orderId, shopId]);
    const updatedOrder = await saveOrderBilling(connection, order);
    const enteredPreparing = action === 'confirmed' && order.status === 'Accepted';
    if (enteredPreparing) {
      await connection.query("UPDATE orders SET status = 'Preparing' WHERE id = ? AND status = 'Accepted'", [orderId]);
      updatedOrder.status = 'Preparing';
    }
    await connection.commit();
    return { ok: true, enteredPreparing, order: { ...updatedOrder, action, shopId: Number(shopId) } };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/** List Accepted/Preparing orders that include items for this shop. */
async function listShopActiveOrders(shopId) {
  const [orders] = await pool.query(
    `SELECT DISTINCT o.id, o.order_number, o.status, o.note, o.created_at, o.delivery_type, o.area_id
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.shop_id = ? AND o.status IN ('Accepted','Preparing')
     ORDER BY o.created_at ASC`,
    [shopId]
  );

  if (orders.length === 0) {
    return [];
  }

  // Shops aren't area-scoped themselves yet (TASK 15), so there's no
  // "this shop's area" to read directly — but its orders now carry a real
  // area_id, and a given shop only ever has orders in one area in
  // practice, so the first row's area_id is what settings (expectedMinutes
  // display only) should read.
  const [settingsRows] = await pool.query(
    'SELECT standard_delivery_minutes, fast_delivery_minutes FROM settings WHERE area_id = ? LIMIT 1',
    [orders[0].area_id]
  );
  const settings = settingsRows[0] || {};

  const orderIds = orders.map((o) => o.id);
  const [items] = await pool.query(
    `SELECT id, order_id, product_name, quantity, variant_label, shop_line_total,
            shop_confirmed_at, shop_rejected_at, shop_ready_at, shop_billable
     FROM order_items WHERE shop_id = ? AND order_id IN (?)`,
    [shopId, orderIds]
  );

  const itemsByOrder = items.reduce((map, it) => {
    if (!map[it.order_id]) map[it.order_id] = [];
    map[it.order_id].push(it);
    return map;
  }, {});

  return orders.map((o) => {
    const myItems = itemsByOrder[o.id] || [];
    const confirmed = myItems.length > 0 && myItems.every((it) => it.shop_confirmed_at !== null);
    const rejected = myItems.length > 0 && myItems.every((it) => it.shop_rejected_at !== null);
    const ready = myItems.length > 0 && myItems.every((it) => it.shop_ready_at !== null);
    const expectedMinutes = o.delivery_type === 'fast'
      ? settings.fast_delivery_minutes
      : settings.standard_delivery_minutes;
    // What VillKro owes this shop for this order — items the shop already
    // rejected don't count (they were never fulfilled). Sums only lines with
    // a configured shop price; unconfigured lines are silently excluded
    // rather than treated as free, same NULL-means-unset rule as the column.
    const shopTotal = myItems
      .filter((it) => isBillableItem(it) && it.shop_line_total !== null && it.shop_line_total !== undefined)
      .reduce((sum, it) => sum + Number(it.shop_line_total), 0);
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
      expectedMinutes,
      expected_minutes: expectedMinutes,
      confirmed,
      rejected,
      ready,
      shopTotal,
      shop_total: shopTotal,
      items: myItems.map((it) => ({
        id: it.id,
        productName: it.product_name,
        product_name: it.product_name,
        quantity: it.quantity,
        variantLabel: it.variant_label,
        variant_label: it.variant_label,
        shopLineTotal: it.shop_line_total !== null ? Number(it.shop_line_total) : null,
        shop_line_total: it.shop_line_total !== null ? Number(it.shop_line_total) : null,
      })),
    };
  });
}

/**
 * Confirm this shop's items on an order.
 * @returns {{ ok: true } | { ok: false, status: number, code: string, message: string }}
 */
async function confirmShopOrder(shopId, orderId, { shopName } = {}) {
  const decision = await changeShopDecision(shopId, orderId, 'confirmed');
  if (!decision.ok) return decision;
  realtimeEvents.emitOrderStatusUpdated(decision.order);
  const countRows = [{ order_status: decision.order.status, area_id: decision.order.area_id }];

  emitToAdmins(countRows[0].area_id, 'admin.order.shop_confirmed', {
    orderId: Number(orderId),
    shopId: Number(shopId),
    shopName: shopName || null,
    action: 'confirmed',
    confirmed: true,
  });

  if (decision.enteredPreparing) {
    notificationService.createOrderNotification({
      userId: decision.order.customer_id, order: decision.order, event: 'status_preparing',
    }).then(result => realtimeEvents.emitNotificationCreated(decision.order.customer_id, result))
      .catch(e => logger.error('[notify]', e.message));
  }

  const { maybeStartRiderAssignment } = require('./riderAssignment');
  maybeStartRiderAssignment(Number(orderId)).catch((e) =>
    logger.error('[rider-assign] maybeStart after shop confirm failed:', e.message)
  );

  await notifyShopOwnerOrderUpdated(shopId, orderId, 'confirmed');
  await notifyAssignedRiderShopChanged(shopId, orderId, 'confirmed');

  return { ok: true, message: 'Order confirmed' };
}

/**
 * Reject this shop's items and remove them from the bill (may auto-cancel order).
 * @param {{shopName?: string, source?: 'owner'|'timeout'}} [opts] - source
 *   distinguishes an owner-pressed Reject from shopAlertSweeper's auto-reject
 *   after SHOP_RESPONSE_TIMEOUT_MS of silence; eligibility is checked under lock.
 */
async function rejectShopOrder(shopId, orderId, { shopName, source = 'owner' } = {}) {
  const decision = await changeShopDecision(shopId, orderId, 'rejected', { source });
  if (!decision.ok) return decision;
  realtimeEvents.emitOrderStatusUpdated(decision.order);
  const countRows = [{ area_id: decision.order.area_id }];

  emitToAdmins(countRows[0].area_id, 'admin.order.updated', {
    orderId: Number(orderId),
    shopId: Number(shopId),
    shopName: shopName || null,
    action: 'rejected',
    rejected: true,
  });

  const isTimeout = source === 'timeout';
  const adminInbox = require('../utils/adminNotifications');
  await adminInbox.createAdminNotification({
    type: adminInbox.TYPES.SHOP_REJECTED,
    title: isTimeout
      ? `${shopName || 'Shop'} did not respond to order #${orderId}`
      : `${shopName || 'Shop'} can't fulfill order #${orderId}`,
    body: isTimeout
      ? `${shopName || 'A shop'} did not confirm or reject order #${orderId} in time, so it was auto-rejected on their behalf. Review and take action (cancel, reassign, contact customer).`
      : `${shopName || 'A shop'} rejected their items on order #${orderId}. Review and take action (cancel, reassign, contact customer).`,
    relatedUrl: `/orders?id=${orderId}`,
    relatedId: String(orderId),
    areaId: countRows[0].area_id,
  });

  const cancelledOrder = await maybeAutoCancelOrderWhenAllShopsRejected(orderId);
  if (cancelledOrder) Object.assign(decision.order, cancelledOrder);

  // A reject can be the LAST decision on a multi-shop order whose other
  // shops already confirmed. Without this the order stalls forever:
  // auto-cancel above only fires when every shop rejected, and
  // recoverStuckAssignments only re-drives orders already in
  // 'searching'/'offered' — one left at 'none' is never picked up again.
  // maybeStartRiderAssignment no-ops when the order just got cancelled,
  // when shops are still undecided, or when nobody confirmed anything.
  const { maybeStartRiderAssignment } = require('./riderAssignment');
  maybeStartRiderAssignment(Number(orderId)).catch((e) =>
    logger.error('[rider-assign] maybeStart after shop reject failed:', e.message)
  );

  await notifyShopOwnerOrderUpdated(shopId, orderId, 'rejected');
  await notifyAssignedRiderShopChanged(shopId, orderId, 'rejected');

  return { ok: true, message: 'Order rejected' };
}

/**
 * Clear this shop's rejection so its items reappear in their Accept/Reject
 * queue — e.g. after an admin swaps a rejected item for one the shop
 * actually stocks. Only while the order is still Accepted/Preparing: a
 * single-shop order auto-cancels the moment its one shop rejects (see
 * maybeAutoCancelOrderWhenAllShopsRejected above), and resend deliberately
 * does not revive a cancelled order — that's a bigger, riskier operation
 * (coupon redemption, rider assignment, payment state) out of scope here.
 */
async function resendShopOrder(shopId, orderId, { shopName } = {}) {
  const decision = await changeShopDecision(shopId, orderId, 'resent');
  if (!decision.ok) return decision;
  realtimeEvents.emitOrderStatusUpdated(decision.order);
  const countRows = [{ area_id: decision.order.area_id }];
  // The shop is waiting again, which is the shop-alert sweeper's work.
  shopAlertGate.wake();

  emitToAdmins(countRows[0].area_id, 'admin.order.updated', {
    orderId: Number(orderId),
    shopId: Number(shopId),
    shopName: shopName || null,
    action: 'resent',
  });

  await notifyShopOwnerOrderUpdated(shopId, orderId, 'resent');
  await notifyAssignedRiderShopChanged(shopId, orderId, 'resent');

  return { ok: true, message: 'Order resent to shop' };
}

/**
 * Mark this shop's items ready for pickup (requires prior confirm).
 */
async function readyShopOrder(shopId, orderId, { shopName } = {}) {
  const [countRows] = await pool.query(
    `SELECT COUNT(*) as cnt, MAX(o.area_id) as area_id FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.order_id = ? AND oi.shop_id = ? AND o.status IN ('Accepted', 'Preparing') AND oi.shop_confirmed_at IS NOT NULL`,
    [orderId, shopId]
  );
  if (countRows[0].cnt === 0) {
    return {
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Order has no confirmed items for this shop',
    };
  }

  await pool.query(
    'UPDATE order_items SET shop_ready_at = NOW() WHERE order_id = ? AND shop_id = ? AND shop_ready_at IS NULL',
    [orderId, shopId]
  );

  emitToAdmins(countRows[0].area_id, 'admin.order.shop_ready', {
    orderId: Number(orderId),
    shopId: Number(shopId),
    shopName: shopName || null,
    action: 'ready',
    ready: true,
  });

  await notifyShopOwnerOrderUpdated(shopId, orderId, 'ready');

  return { ok: true, message: 'Order marked ready' };
}

/**
 * Record that this shop's device actually displayed the new-order alarm —
 * called by the shop app right after notifee successfully rings it (killed-
 * app FCM path) or when the popup appears in-app. Proof-of-delivery, not a
 * state transition: never fails the request if there's nothing to ack
 * (already confirmed/rejected, or no items for this shop on this order).
 * shopAlertSweeper eases off reminder frequency once acked.
 */
async function ackShopOrderAlert(shopId, orderId) {
  const [result] = await pool.query(
    `UPDATE order_items SET shop_alert_acked_at = NOW()
     WHERE order_id = ? AND shop_id = ? AND shop_alert_acked_at IS NULL
       AND shop_confirmed_at IS NULL AND shop_rejected_at IS NULL`,
    [orderId, shopId]
  );
  return { ok: true, acked: result.affectedRows > 0 };
}

module.exports = {
  ACTIVE_ORDER_STATUSES,
  listShopActiveOrders,
  confirmShopOrder,
  rejectShopOrder,
  readyShopOrder,
  resendShopOrder,
  ackShopOrderAlert,
  notifyShopOwnerOrderUpdated,
};
