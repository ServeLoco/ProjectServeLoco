const { pool } = require('../db/mysql');

const getCancelledPaymentStatus = (paymentMethod) => (
  paymentMethod === 'UPI' ? 'Refunded' : 'Failed'
);

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

// What this shop is paid for this order — the same sum the dashboard shows as
// "You'll receive" (shopOwnerController's shopTotal). Rides along on the alarm
// push so the owner's floating offer card can show the amount without the app
// being awake to look it up. Unpriced items carry a NULL shop_line_total and
// simply don't count yet; '' (not '0') when there is nothing to show, so the
// card renders no amount rather than "₹0".
// Batch form of getShopPayableTotal: every shop on the order in ONE round trip.
// notifyShopsForOrder used to run getShopPayableTotal per shop, serially, and
// each of those is a full trip to the DB (which lives in another region in
// production) sitting between the order and the owner's alarm.
// Covers every shop on the order, so callers can fire it without first knowing
// which shops those are — that lets it run alongside the shop lookup instead of
// after it. Returns Map<shopId, string>, same '' -> "render no amount"
// convention as getShopPayableTotal.
const getShopPayableTotals = async (orderId) => {
  const totals = new Map();
  try {
    const { roundMoney } = require('./money');
    const [rows] = await pool.query(
      `SELECT shop_id, COALESCE(SUM(shop_line_total), 0) AS total
       FROM order_items
       WHERE order_id = ? AND shop_id IS NOT NULL AND shop_rejected_at IS NULL
       GROUP BY shop_id`,
      [orderId]
    );
    for (const row of rows) {
      const total = Number(row.total) || 0;
      totals.set(row.shop_id, total > 0 ? String(roundMoney(total)) : '');
    }
  } catch (e) {
    // Cosmetic — a missing amount must never cost the owner the alarm itself.
  }
  return totals;
};

const getShopPayableTotal = async (orderId, shopId) => {
  try {
    const { roundMoney } = require('./money');
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(shop_line_total), 0) AS total
       FROM order_items
       WHERE order_id = ? AND shop_id = ? AND shop_rejected_at IS NULL`,
      [orderId, shopId]
    );
    const total = Number(rows[0]?.total) || 0;
    return total > 0 ? String(roundMoney(total)) : '';
  } catch (e) {
    // Cosmetic — a missing amount must never cost the owner the alarm itself.
    return '';
  }
};

// Fire-and-forget fan-out to the owners of every shop with items in this
// order. Never throws (callers are inside order-status paths that must not
// fail because a push failed).
const notifyShopsForOrder = async (order) => {
  try {
    // Both queries only need order.id, so they go out together rather than one
    // after the other — this is the accepted-order-to-ringing-phone path and
    // the DB is a region away in production, so every serial round trip here is
    // dead time the owner feels. The owner's fcm_token rides along on the shop
    // lookup for the same reason: the alarm send would otherwise look it up
    // itself, once per owner, with the push waiting on it.
    const [[rows], totals] = await Promise.all([
      pool.query(
        `SELECT DISTINCT s.id AS shop_id, s.name AS shop_name, s.owner_user_id,
                u.fcm_token AS owner_fcm_token
         FROM order_items oi
         JOIN shops s ON s.id = oi.shop_id
         LEFT JOIN users u ON u.id = s.owner_user_id
         WHERE oi.order_id = ? AND s.active = 1 AND s.owner_user_id IS NOT NULL`,
        [order.id]
      ),
      getShopPayableTotals(order.id),
    ]);
    if (rows.length === 0) return;
    const { emitToCustomer } = require('../realtime/socket');
    const expoPush = require('./expoPush');
    for (const row of rows) {
      emitToCustomer(row.owner_user_id, 'shop.order.assigned', {
        orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
      });
    }
    // Prefer native FCM data-only (killed-app notifee alarm + offer card).
    // Fallback to Expo title+body tray for owners without an fcm_token yet.
    //
    // Each owner gets their own message rather than one fan-out: every shop on
    // the order is paid a different amount, and the alarm payload carries that
    // shop's own total for its offer card. The sends run in parallel, and the
    // per-shop totals come from one grouped query — this path is what stands
    // between the order and the owner's phone ringing, so nothing in it waits
    // on anything it doesn't have to.
    const fcmAlarm = require('./fcmAlarmPush');
    const shopIds = rows.map((r) => r.shop_id);
    const pushes = Promise.all(rows.map(async (row) => {
      const alarmData = {
        type: 'shop_order',
        alertType: 'new_order_alarm',
        orderId: order.id,
        orderNumber: order.order_number,
        total: totals.get(row.shop_id) ?? '',
      };
      const res = await fcmAlarm
        .sendFcmDataOnlyToUser(pool, row.owner_user_id, alarmData, { token: row.owner_fcm_token })
        .catch(() => ({ sent: false }));
      if (res?.sent) return;
      await expoPush.sendPushToUser(pool, row.owner_user_id, {
        title: 'New order to prepare',
        body: `Order ${order.order_number} has items for your shop. Open the app to confirm.`,
        channelId: 'serveloco-orders-alarm-v5',
        sound: 'order_alarm',
        tag: `shop_order_${order.id}`,
        collapseId: `shop_order_${order.id}`,
        data: alarmData,
      }).catch(() => {});
    })).catch(() => {});

    // Stamp the initial alert time so shopAlertSweeper's reminder throttle
    // (SHOP_ALERT_REMIND_MS) counts from this push, not from its own first tick.
    // Started after the pushes are already in flight: it is bookkeeping for a
    // sweeper that next ticks seconds from now, so it must not delay the alarm.
    await pool.query(
      `UPDATE order_items SET shop_last_notified_at = NOW(), shop_notify_count = shop_notify_count + 1
       WHERE order_id = ? AND shop_id IN (?) AND shop_confirmed_at IS NULL AND shop_rejected_at IS NULL`,
      [order.id, shopIds]
    );
    await pushes;
  } catch (e) {
    console.error('[shops] notifyShopsForOrder failed for order', order?.id, e.message);
  }
};

// Fire-and-forget fan-out when an order a shop was already preparing
// (Accepted/Preparing) gets cancelled — otherwise the order just vanishes
// from the shop owner's list with no explanation and they keep cooking it.
// Also pings admin Shops panel listeners (per shopId) so "Waiting to confirm"
// clears immediately after admin cancel on the Orders page.
const notifyShopsOrderCancelled = async (order) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id AS shop_id, s.name AS shop_name, s.owner_user_id
       FROM order_items oi JOIN shops s ON s.id = oi.shop_id
       WHERE oi.order_id = ? AND s.active = 1`,
      [order.id]
    );
    if (rows.length === 0) return;
    const { emitToCustomer, emitToAdmins } = require('../realtime/socket');
    const expoPush = require('./expoPush');
    const ownerIds = [];
    for (const row of rows) {
      // Admin Shops panel filters by shopId on shop_* events; include shopId
      // so the open panel for that shop refetches and drops the cancelled order.
      emitToAdmins(order.area_id, 'admin.order.updated', {
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'Cancelled',
        shopId: row.shop_id,
        shop_id: row.shop_id,
      });
      if (row.owner_user_id) {
        ownerIds.push(row.owner_user_id);
        emitToCustomer(row.owner_user_id, 'shop.order.cancelled', {
          orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
        });
        // shop.order.updated also drives dashboard/popup refetch (same as admin confirm).
        emitToCustomer(row.owner_user_id, 'shop.order.updated', {
          orderId: order.id,
          shopId: row.shop_id,
          action: 'cancelled',
        });
      }
    }
    if (ownerIds.length > 0) {
      expoPush.sendPushToMany(pool, ownerIds, {
        title: 'Order cancelled',
        body: `Order ${order.order_number} was cancelled. Please stop preparing it.`,
        data: { type: 'shop_order', orderId: order.id },
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[shops] notifyShopsOrderCancelled failed for order', order?.id, e.message);
  }
};

// Re-push the same alarm (socket + FCM/Expo) to ONE shop owner who has not
// yet confirmed/rejected — used by shopAlertSweeper.remindPendingShopOrders
// for weak-network retries. Unlike notifyShopsForOrder this never fans out
// to every shop on the order, only the one still waiting. Caller is
// responsible for the shop_last_notified_at/shop_notify_count write (the
// sweeper batches that across all reminded rows in one query).
const remindShopOrderOwner = async (order, shopId, ownerUserId, options = {}) => {
  try {
    const { emitToCustomer } = require('../realtime/socket');
    const expoPush = require('./expoPush');
    const fcmAlarm = require('./fcmAlarmPush');
    emitToCustomer(ownerUserId, 'shop.order.assigned', {
      orderId: order.id, orderNumber: order.order_number, shopId,
    });
    const alarmData = {
      type: 'shop_order',
      alertType: 'new_order_alarm',
      orderId: order.id,
      orderNumber: order.order_number,
      total: await getShopPayableTotal(order.id, shopId),
    };
    // options.fcmToken: the sweeper's own SELECT already carries the owner's
    // token, so passing it here saves a second DB round trip (the pool talks to
    // another region in production) on every single retry.
    const fcmResult = await fcmAlarm.sendFcmDataOnlyToUser(pool, ownerUserId, alarmData, {
      token: options.fcmToken || null,
    });
    if (!fcmResult.sent) {
      await expoPush.sendPushToUser(pool, ownerUserId, {
        title: 'Order still waiting for you',
        body: `Order ${order.order_number} is still waiting for your shop to confirm. Please open the app.`,
        channelId: 'serveloco-orders-alarm-v5',
        sound: 'order_alarm',
        tag: `shop_order_${order.id}`,
        collapseId: `shop_order_${order.id}`,
        data: alarmData,
      });
    }
  } catch (e) {
    console.error('[shops] remindShopOrderOwner failed for order', order?.id, 'shop', shopId, e.message);
  }
};

// Re-emit the "you have an order waiting" event to a shop owner the instant
// their socket connects, for every order of theirs still unconfirmed.
//
// Why this exists: notifyShopsForOrder fires once, when the order leaves
// Pending. An owner whose phone had no signal at that moment misses both the
// socket emit and (until the carrier flushes it) the FCM message, and the only
// thing that would re-push is shopAlertSweeper on its next due tick. A socket
// connecting IS the proof the phone is reachable again, so this hands them the
// order immediately instead of leaving them waiting on that tick.
//
// Socket only, deliberately: the device is demonstrably online and the app is
// running, so a push would just be a second ring for an order they can already
// see. It also leaves shop_last_notified_at alone — that column throttles the
// sweeper's *pushes*, and a free socket emit must not make the next real push
// later than it would have been.
//
// Cheap enough to run on every customer connect: the shops join is on
// idx_shop_owner and a non-owner matches no rows.
const resendPendingShopAlerts = async (ownerUserId) => {
  try {
    if (!ownerUserId) return;
    const [rows] = await pool.query(
      `SELECT DISTINCT o.id AS order_id, o.order_number, oi.shop_id
       FROM order_items oi
       JOIN shops s ON s.id = oi.shop_id AND s.active = 1
       JOIN orders o ON o.id = oi.order_id
       WHERE s.owner_user_id = ?
         AND o.status IN ('Accepted', 'Preparing')
         AND oi.shop_confirmed_at IS NULL
         AND oi.shop_rejected_at IS NULL`,
      [ownerUserId]
    );
    if (rows.length === 0) return;
    const { emitToCustomer } = require('../realtime/socket');
    for (const row of rows) {
      emitToCustomer(ownerUserId, 'shop.order.assigned', {
        orderId: row.order_id,
        orderNumber: row.order_number,
        shopId: row.shop_id,
      });
    }
  } catch (e) {
    console.error('[shops] resendPendingShopAlerts failed for user', ownerUserId, e.message);
  }
};

// Notify shops when a rider is assigned to their order.
const notifyShopsRiderAssigned = async (order) => {
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
      emitToCustomer(row.owner_user_id, 'shop.order.rider_assigned', {
        orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
      });
    }
    expoPush.sendPushToMany(pool, rows.map(r => r.owner_user_id), {
      title: 'Rider assigned',
      body: `A rider accepted order ${order.order_number}.`,
      data: { type: 'shop_order', orderId: order.id },
    }).catch(() => {});
  } catch (e) {
    console.error('[shops] notifyShopsRiderAssigned failed for order', order?.id, e.message);
  }
};

// Notify shops when order status leaves the shop "active" list (Out for Delivery /
// Delivered / Cancelled) so the owner dashboard drops the card without a manual refresh.
// Also used for intermediate status updates if the shop UI cares later.
// Socket only — no push spam (owners already got "new order" / "rider assigned").
const notifyShopsOrderStatusChanged = async (order) => {
  try {
    if (!order?.id) return;
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id AS shop_id, s.owner_user_id
       FROM order_items oi JOIN shops s ON s.id = oi.shop_id
       WHERE oi.order_id = ? AND s.active = 1 AND s.owner_user_id IS NOT NULL`,
      [order.id]
    );
    if (rows.length === 0) return;
    const { emitToCustomer } = require('../realtime/socket');
    const status = order.status;
    for (const row of rows) {
      // shop.order.updated is what ShopDashboardScreen already refetches on.
      emitToCustomer(row.owner_user_id, 'shop.order.updated', {
        orderId: order.id,
        orderNumber: order.order_number,
        shopId: row.shop_id,
        status,
        action: 'status',
      });
    }
  } catch (e) {
    console.error('[shops] notifyShopsOrderStatusChanged failed for order', order?.id, e.message);
  }
};

// Notify shops when an admin adds/edits the remark on their order — reuses
// shop.order.updated (same event ShopOrdersScreen already refetches on for
// status changes), just with action: 'remark' for future callers that want
// to distinguish it. No push — a note isn't urgent enough to alert on.
const notifyShopsOrderRemarkUpdated = async (order) => {
  try {
    if (!order?.id) return;
    const [rows] = await pool.query(
      `SELECT DISTINCT s.id AS shop_id, s.owner_user_id
       FROM order_items oi JOIN shops s ON s.id = oi.shop_id
       WHERE oi.order_id = ? AND s.active = 1 AND s.owner_user_id IS NOT NULL`,
      [order.id]
    );
    if (rows.length === 0) return;
    const { emitToCustomer } = require('../realtime/socket');
    for (const row of rows) {
      emitToCustomer(row.owner_user_id, 'shop.order.updated', {
        orderId: order.id,
        orderNumber: order.order_number,
        shopId: row.shop_id,
        action: 'remark',
      });
    }
  } catch (e) {
    console.error('[shops] notifyShopsOrderRemarkUpdated failed for order', order?.id, e.message);
  }
};

// Fire-and-forget notify for a single shop whose order item was just
// replaced by an admin (out-of-stock swap). Unlike notifyShopsOrderRemarkUpdated
// this never fans out to every shop on the order — only the one shop that
// owns the replaced line item needs to know.
const notifyShopsOrderItemReplaced = async (order, shopId) => {
  try {
    if (!order?.id || !shopId) return;
    const [rows] = await pool.query(
      'SELECT owner_user_id FROM shops WHERE id = ? AND active = 1',
      [shopId]
    );
    const ownerUserId = rows[0]?.owner_user_id;
    if (!ownerUserId) return;
    const { emitToCustomer } = require('../realtime/socket');
    emitToCustomer(ownerUserId, 'shop.order.updated', {
      orderId: order.id,
      orderNumber: order.order_number,
      shopId,
      action: 'item_replaced',
    });
  } catch (e) {
    console.error('[shops] notifyShopsOrderItemReplaced failed for order', order?.id, e.message);
  }
};

// Notify shops when rider assignment failed and the order was cancelled.
const notifyShopsRiderAssignmentFailed = async (order) => {
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
      emitToCustomer(row.owner_user_id, 'shop.order.rider_failed', {
        orderId: order.id, orderNumber: order.order_number, shopId: row.shop_id,
      });
    }
    expoPush.sendPushToMany(pool, rows.map(r => r.owner_user_id), {
      title: 'No rider available',
      body: `Order ${order.order_number} was cancelled — no rider accepted.`,
      data: { type: 'shop_order', orderId: order.id },
    }).catch(() => {});
  } catch (e) {
    console.error('[shops] notifyShopsRiderAssignmentFailed failed for order', order?.id, e.message);
  }
};

// If every active multi-vendor shop in this AREA is now closed, auto-close
// that area's "Shop Status" banner (settings.shop_open) too — so the admin
// dashboard tracks reality instead of needing a separate manual flip every
// time a shop opens or closes. delivery_available is the master gate: if
// it's off, shop_open is forced closed no matter how many shops are open
// (the business isn't delivering, full stop — products still show in the
// menu, they just can't be ordered). If delivery_available is on, shop_open
// tracks whether any active shop in THIS area is currently open.
// No-ops when this area has no active shops — delivery_available is the
// sole gate there, and settingsController already respects it directly on
// manual shop_open writes.
//
// Emits go to this area's own `customers:<areaId>` room only
// (emitToAllCustomers(areaId, ...) below, TASK 23) — never every connected
// customer platform-wide.
const syncAreaShopOpenState = async (areaId) => {
  try {
    let changed = false;
    let areaOpen = null;

    const [settingsRows] = await pool.query('SELECT delivery_available FROM settings WHERE area_id = ? LIMIT 1', [areaId]);
    if (settingsRows.length === 0) return;

    const deliveryAvailable = Boolean(settingsRows[0].delivery_available);
    if (!deliveryAvailable) {
      const [result] = await pool.query('UPDATE settings SET shop_open = 0 WHERE shop_open = 1 AND area_id = ?', [areaId]);
      changed = result.affectedRows > 0;
      areaOpen = false;
    } else {
      const [shopRows] = await pool.query(
        `SELECT
           SUM(active = 1) AS total_active,
           SUM(active = 1 AND is_open = 1) AS total_open
         FROM shops
         WHERE area_id = ?`,
        [areaId]
      );
      const totalActive = Number(shopRows[0]?.total_active) || 0;
      if (totalActive === 0) return;

      const totalOpen = Number(shopRows[0]?.total_open) || 0;
      const desiredOpen = totalOpen > 0 ? 1 : 0;
      const [result] = await pool.query('UPDATE settings SET shop_open = ? WHERE shop_open != ? AND area_id = ?', [desiredOpen, desiredOpen, areaId]);
      changed = result.affectedRows > 0;
      areaOpen = Boolean(desiredOpen);
    }

    if (changed) {
      // The public /api/settings response is served from a 15s TTL cache
      // that only updateSettings normally busts — clear it here too, or the
      // customer app keeps reading the stale shop_open we just changed.
      // Lazy require: settingsController requires this file at load time,
      // so a top-level require here would be a circular import.
      const { bustSettingsCache } = require('../controllers/settingsController');
      bustSettingsCache(areaId);
      const microCache = require('./microCache');
      microCache.bust('dashboard', areaId);
      microCache.bust('categories', areaId);
      // bumpCatalogVersion too (bug fix, multi-area audit finding #8) —
      // without it, a client holding the public /api/settings ETag
      // (catalogETag, keyed on <areaId>-<catalog_version>) kept getting a
      // bare 304 with the stale shop_open baked into its cached body, since
      // nothing here ever changed catalog_version.
      const { bumpCatalogVersion } = require('./areaScope');
      await bumpCatalogVersion(areaId);

      // Let connected customer apps flip their "shop closed" banner
      // immediately instead of waiting for the next settings poll.
      const { emitToAllCustomers } = require('../realtime/socket');
      emitToAllCustomers(areaId, 'settings.shop_open.updated', { shopOpen: areaOpen, shop_open: areaOpen });
    }
  } catch (e) {
    console.error('[shops] syncAreaShopOpenState failed:', e.message);
  }
};

// When every shop with items on an order has rejected them, cancel the order
// automatically (same side effects as an admin cancel) and notify the admin.
// Fire-and-forget from shop reject — must never throw back to the shop owner.
const maybeAutoCancelOrderWhenAllShopsRejected = async (orderId) => {
  try {
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orderRows.length === 0) return null;

    const order = orderRows[0];
    const currentStatus = order.status;
    if (currentStatus !== 'Accepted' && currentStatus !== 'Preparing') return null;

    const [items] = await pool.query(
      'SELECT shop_id, shop_rejected_at FROM order_items WHERE order_id = ? AND shop_id IS NOT NULL',
      [orderId]
    );
    if (items.length === 0) return null;

    const byShop = new Map();
    for (const it of items) {
      if (!byShop.has(it.shop_id)) byShop.set(it.shop_id, []);
      byShop.get(it.shop_id).push(it);
    }
    for (const shopItems of byShop.values()) {
      if (!shopItems.every(it => it.shop_rejected_at !== null)) return null;
    }

    const cancelledPaymentStatus = getCancelledPaymentStatus(order.payment_method);
    const { resolveCancelReason } = require('./cancelReasons');
    const cancelReason = resolveCancelReason('shops');

    const connection = await pool.getConnection();
    let cancelled = false;
    try {
      await connection.beginTransaction();
      const [cancelResult] = await connection.query(
        'UPDATE orders SET status = ?, payment_status = ?, cancel_reason = ? WHERE id = ? AND status = ?',
        ['Cancelled', cancelledPaymentStatus, cancelReason, orderId, currentStatus]
      );
      if (cancelResult.affectedRows === 0) {
        await connection.rollback();
        return null;
      }
      if (order.coupon_id) {
        await connection.query(
          "UPDATE coupon_redemptions SET status = 'cancelled' WHERE order_id = ? AND coupon_id = ?",
          [orderId, order.coupon_id]
        );
      }
      await connection.commit();
      cancelled = true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    if (!cancelled) return null;

    const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    const updatedOrder = updatedRows[0];

    const [shopRows] = await pool.query(
      `SELECT DISTINCT s.name
         FROM order_items oi
         JOIN shops s ON s.id = oi.shop_id
        WHERE oi.order_id = ?`,
      [orderId]
    );
    const shopNames = shopRows.map(row => row.name).filter(Boolean).join(', ');

    const adminInbox = require('./adminNotifications');
    await adminInbox.createAdminNotification({
      type: adminInbox.TYPES.ORDER_AUTO_CANCELLED,
      title: `Order #${updatedOrder.order_number || orderId} auto-cancelled`,
      body: shopNames
        ? `All shops (${shopNames}) rejected this order. It was cancelled automatically.`
        : 'All shops rejected this order. It was cancelled automatically.',
      relatedUrl: `/orders?id=${orderId}`,
      relatedId: String(orderId),
      areaId: updatedOrder.area_id,
    });

    const notificationService = require('./notificationService');
    const realtimeEvents = require('../realtime/orderEvents');

    notificationService.createOrderNotification({
      userId: updatedOrder.customer_id,
      order: updatedOrder,
      event: 'status_cancelled',
    })
      .then(result => realtimeEvents.emitNotificationCreated(updatedOrder.customer_id, result))
      .catch(err => console.error('[notify]', err.message));

    notifyShopsOrderCancelled(updatedOrder);
    realtimeEvents.emitOrderStatusUpdated(updatedOrder);

    try {
      const { revokeOffersForOrder } = require('../services/riderAssignment');
      await revokeOffersForOrder(orderId);
    } catch (_) { /* best-effort */ }

    return updatedOrder;
  } catch (e) {
    console.error('[shops] maybeAutoCancelOrderWhenAllShopsRejected failed for order', orderId, e.message);
    return null;
  }
};

module.exports = {
  getShopForUser,
  notifyShopsForOrder,
  remindShopOrderOwner,
  resendPendingShopAlerts,
  syncAreaShopOpenState,
  notifyShopsOrderCancelled,
  notifyShopsRiderAssigned,
  notifyShopsRiderAssignmentFailed,
  notifyShopsOrderStatusChanged,
  notifyShopsOrderRemarkUpdated,
  notifyShopsOrderItemReplaced,
  maybeAutoCancelOrderWhenAllShopsRejected,
};
