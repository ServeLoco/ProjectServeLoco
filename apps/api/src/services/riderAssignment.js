/**
 * Rider auto-assignment engine.
 * One pending offer per order at a time; least completed deliveries today;
 * 120s server timer; reassign on reject/expire/post-accept-cancel.
 * See plans/rider-mode-order-assignment.md §7.
 */

const { pool } = require('../db/mysql');
const config = require('../config/env');
const {
  listEligibleRiders,
  selectEligibleRider,
  syncDeliveryAvailabilityFromRiders,
} = require('../utils/riders');

const RIDER_OFFER_TIMEOUT_SEC = config.RIDER_OFFER_TIMEOUT_SEC || 120;

const getCancelledPaymentStatus = (paymentMethod) => (
  paymentMethod === 'UPI' ? 'Refunded' : 'Failed'
);

const log = (...args) => console.log('[rider-assign]', ...args);

/** Riders who already have any offer row for this order (cannot re-offer). */
const getExcludedRiderIdsForOrder = async (orderId, connection = pool) => {
  const [rows] = await connection.query(
    'SELECT rider_id FROM rider_order_offers WHERE order_id = ?',
    [orderId]
  );
  return rows.map((r) => r.rider_id);
};

const loadOrder = async (orderId, connection = pool) => {
  const [rows] = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows[0] || null;
};

/**
 * Notify selected rider via socket + Expo push.
 */
const notifyRiderOffer = async (rider, order, offer) => {
  try {
    const { emitToCustomer } = require('../realtime/socket');
    const payload = {
      offerId: offer.id,
      orderId: order.id,
      orderNumber: order.order_number,
      expiresAt: offer.expires_at,
      expires_at: offer.expires_at,
    };
    emitToCustomer(rider.userId || rider.user_id, 'rider.offer.created', payload);

    const expoPush = require('../utils/expoPush');
    await expoPush.sendPushToUser(pool, rider.userId || rider.user_id, {
      title: 'New delivery offer',
      body: `Order ${order.order_number} — accept within 2 minutes`,
      data: {
        type: 'rider_offer',
        offerId: offer.id,
        orderId: order.id,
        expiresAt: offer.expires_at,
      },
    });
  } catch (e) {
    console.error('[rider-assign] notifyRiderOffer failed:', e.message);
  }
};

/**
 * Create a single pending offer for chosen rider. Enforces no second pending.
 */
const createOffer = async (orderId, rider) => {
  const connection = await pool.getConnection();
  let offer = null;
  try {
    await connection.beginTransaction();

    const [pending] = await connection.query(
      `SELECT id FROM rider_order_offers
       WHERE order_id = ? AND status = 'pending' FOR UPDATE`,
      [orderId]
    );
    if (pending.length > 0) {
      await connection.rollback();
      log('createOffer skipped — pending offer exists', orderId);
      return null;
    }

    const [orderRows] = await connection.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    const order = orderRows[0];
    if (!order || order.status === 'Cancelled' || order.rider_id) {
      await connection.rollback();
      return null;
    }

    const expiresAt = new Date(Date.now() + RIDER_OFFER_TIMEOUT_SEC * 1000);
    const [insertResult] = await connection.query(
      `INSERT INTO rider_order_offers (order_id, rider_id, status, expires_at)
       VALUES (?, ?, 'pending', ?)`,
      [orderId, rider.id, expiresAt]
    );

    await connection.query(
      `UPDATE orders SET rider_assignment_status = 'offered' WHERE id = ?`,
      [orderId]
    );

    await connection.commit();
    offer = {
      id: insertResult.insertId,
      order_id: orderId,
      rider_id: rider.id,
      status: 'pending',
      expires_at: expiresAt,
    };

    await notifyRiderOffer(rider, order, offer);
    log('offer created', { orderId, offerId: offer.id, riderId: rider.id });
    return offer;
  } catch (e) {
    await connection.rollback();
    // Unique uq_offer_order_rider — rider already offered this order
    if (e && e.code === 'ER_DUP_ENTRY') {
      log('createOffer dup rider for order', orderId, rider.id);
      return null;
    }
    console.error('[rider-assign] createOffer failed:', e.message);
    throw e;
  } finally {
    connection.release();
  }
};

/**
 * Cancel order when no riders remain. Same side-effects as shop auto-cancel.
 */
const failAssignment = async (orderId, reason = 'No riders available') => {
  try {
    const order = await loadOrder(orderId);
    if (!order) return null;
    if (order.status === 'Cancelled' || order.status === 'Delivered') {
      await pool.query(
        `UPDATE orders SET rider_assignment_status = 'failed' WHERE id = ?`,
        [orderId]
      );
      return order;
    }

    const currentStatus = order.status;
    const cancelReason = reason.startsWith('No rider') || reason.includes('rider')
      ? reason
      : `No riders available: ${reason}`;
    const paymentStatus = getCancelledPaymentStatus(order.payment_method);

    const connection = await pool.getConnection();
    let cancelled = false;
    try {
      await connection.beginTransaction();
      const [cancelResult] = await connection.query(
        `UPDATE orders
         SET status = 'Cancelled',
             payment_status = ?,
             cancel_reason = ?,
             rider_assignment_status = 'failed',
             rider_id = NULL,
             rider_assigned_at = NULL
         WHERE id = ? AND status = ?`,
        [paymentStatus, cancelReason, orderId, currentStatus]
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
      // Revoke any pending offers
      await connection.query(
        `UPDATE rider_order_offers
         SET status = 'cancelled', responded_at = NOW(), reject_reason = 'admin'
         WHERE order_id = ? AND status = 'pending'`,
        [orderId]
      );
      await connection.commit();
      cancelled = true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    if (!cancelled) return null;

    const updated = (await loadOrder(orderId)) || {
      ...order,
      status: 'Cancelled',
      cancel_reason: cancelReason,
      rider_assignment_status: 'failed',
    };

    const adminInbox = require('../utils/adminNotifications');
    const notifType = reason === 'No riders available' || /zero|no rider/i.test(reason)
      ? adminInbox.TYPES.RIDER_ZERO_AVAILABLE
      : adminInbox.TYPES.ORDER_CANCELLED_NO_RIDER;
    await adminInbox.createAdminNotification({
      type: notifType,
      title: `Order #${updated.order_number || orderId} — no rider`,
      body: cancelReason,
      relatedUrl: `/orders?id=${orderId}`,
      relatedId: String(orderId),
    });
    // Also fire assignment_failed for admin filter convenience
    await adminInbox.createAdminNotification({
      type: adminInbox.TYPES.RIDER_ASSIGNMENT_FAILED,
      title: `Rider assignment failed #${updated.order_number || orderId}`,
      body: cancelReason,
      relatedUrl: `/orders?id=${orderId}`,
      relatedId: String(orderId),
    }).catch(() => {});

    const notificationService = require('../utils/notificationService');
    const realtimeEvents = require('../realtime/orderEvents');
    const { notifyShopsOrderCancelled } = require('../utils/shops');

    if (updated.customer_id) {
      notificationService.createOrderNotification({
        userId: updated.customer_id,
        order: updated,
        event: 'status_cancelled',
      })
        .then((result) => realtimeEvents.emitNotificationCreated(updated.customer_id, result))
        .catch((err) => console.error('[notify]', err.message));
    }

    notifyShopsOrderCancelled(updated);
    try {
      const { notifyShopsRiderAssignmentFailed } = require('../utils/shops');
      notifyShopsRiderAssignmentFailed(updated);
    } catch (_) { /* best-effort */ }
    realtimeEvents.emitOrderStatusUpdated(updated);

    try {
      const { emitToAdmins } = require('../realtime/socket');
      emitToAdmins('admin.order.rider_updated', {
        orderId,
        status: 'failed',
        reason: cancelReason,
      });
    } catch (_) { /* best-effort */ }

    await syncDeliveryAvailabilityFromRiders();
    log('failAssignment', { orderId, reason: cancelReason });
    return updated;
  } catch (e) {
    console.error('[rider-assign] failAssignment failed:', e.message);
    return null;
  }
};

/**
 * After reject/expire/post-accept-cancel: pick next eligible or fail.
 */
const continueAssignment = async (orderId) => {
  const order = await loadOrder(orderId);
  if (!order || order.status === 'Cancelled' || order.rider_id) {
    return { continued: false };
  }

  // Only one pending at a time
  const [pending] = await pool.query(
    `SELECT id FROM rider_order_offers WHERE order_id = ? AND status = 'pending' LIMIT 1`,
    [orderId]
  );
  if (pending.length > 0) {
    return { continued: false, reason: 'pending_exists' };
  }

  const excluded = await getExcludedRiderIdsForOrder(orderId);
  const eligible = await listEligibleRiders({ excludeIds: excluded });
  if (eligible.length === 0) {
    await failAssignment(orderId, 'No rider accepted');
    return { continued: false, failed: true };
  }

  const chosen = await selectEligibleRider(eligible);
  if (!chosen) {
    await failAssignment(orderId, 'No rider accepted');
    return { continued: false, failed: true };
  }

  await pool.query(
    `UPDATE orders SET rider_assignment_status = 'searching' WHERE id = ? AND rider_id IS NULL`,
    [orderId]
  );
  const offer = await createOffer(orderId, chosen);
  return { continued: true, offer, riderId: chosen.id };
};

/**
 * Start assignment for an order (after shops confirmed or house Accepted).
 */
const startAssignment = async (orderId) => {
  try {
    const connection = await pool.getConnection();
    let order;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [orderId]
      );
      order = rows[0];
      if (!order) {
        await connection.rollback();
        return { started: false, reason: 'not_found' };
      }
      if (order.status === 'Cancelled' || order.status === 'Delivered') {
        await connection.rollback();
        return { started: false, reason: 'terminal_status' };
      }
      if (order.rider_id) {
        await connection.rollback();
        return { started: false, reason: 'already_assigned' };
      }
      const st = order.rider_assignment_status || 'none';
      if (st === 'searching' || st === 'offered' || st === 'assigned') {
        await connection.rollback();
        return { started: false, reason: 'already_in_progress', status: st };
      }
      // failed can be re-started only if we explicitly allow — v1 no restart
      if (st === 'failed') {
        await connection.rollback();
        return { started: false, reason: 'already_failed' };
      }

      await connection.query(
        `UPDATE orders SET rider_assignment_status = 'searching' WHERE id = ?`,
        [orderId]
      );
      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }

    const excluded = await getExcludedRiderIdsForOrder(orderId);
    const eligible = await listEligibleRiders({ excludeIds: excluded });
    if (eligible.length === 0) {
      await failAssignment(orderId, 'No riders available');
      return { started: true, failed: true, reason: 'no_riders' };
    }

    const chosen = await selectEligibleRider(eligible);
    if (!chosen) {
      await failAssignment(orderId, 'No riders available');
      return { started: true, failed: true, reason: 'no_riders' };
    }

    const offer = await createOffer(orderId, chosen);
    log('startAssignment', { orderId, riderId: chosen.id, offerId: offer?.id });
    return { started: true, offer, riderId: chosen.id };
  } catch (e) {
    console.error('[rider-assign] startAssignment failed:', e.message);
    return { started: false, error: e.message };
  }
};

/**
 * House-only orders (no shop-linked items): start assignment on platform Accepted.
 * No-ops when the order has any shop_id lines (shops must confirm first).
 */
const startAssignmentIfHouseOnly = async (orderId) => {
  try {
    const [items] = await pool.query(
      'SELECT shop_id FROM order_items WHERE order_id = ? AND shop_id IS NOT NULL LIMIT 1',
      [orderId]
    );
    if (items.length > 0) {
      return { started: false, reason: 'has_shops' };
    }
    return startAssignment(orderId);
  } catch (e) {
    console.error('[rider-assign] startAssignmentIfHouseOnly failed:', e.message);
    return { started: false, error: e.message };
  }
};

/**
 * Start assignment only when all shops on the order have confirmed.
 * House-only orders (no shop_id items): caller should call startAssignmentIfHouseOnly / startAssignment.
 */
const maybeStartRiderAssignment = async (orderId) => {
  try {
    const order = await loadOrder(orderId);
    if (!order || order.status === 'Cancelled' || order.rider_id) return { started: false };

    const [items] = await pool.query(
      'SELECT shop_id, shop_confirmed_at, shop_rejected_at FROM order_items WHERE order_id = ?',
      [orderId]
    );
    const shopItems = items.filter((it) => it.shop_id != null);
    if (shopItems.length === 0) {
      // House items only — do not auto-start here (Accepted path handles it).
      return { started: false, reason: 'no_shops' };
    }

    // Group by shop_id
    const byShop = new Map();
    for (const it of shopItems) {
      if (!byShop.has(it.shop_id)) byShop.set(it.shop_id, []);
      byShop.get(it.shop_id).push(it);
    }

    // Every shop must have all its items confirmed (or fully rejected — but then
    // auto-cancel may run; if any shop fully rejected, skip start).
    for (const shopItemsList of byShop.values()) {
      const allRejected = shopItemsList.every((it) => it.shop_rejected_at != null);
      if (allRejected) {
        return { started: false, reason: 'shop_rejected' };
      }
      const allConfirmed = shopItemsList.every((it) => it.shop_confirmed_at != null);
      if (!allConfirmed) {
        return { started: false, reason: 'waiting_shops' };
      }
    }

    return startAssignment(orderId);
  } catch (e) {
    console.error('[rider-assign] maybeStartRiderAssignment failed:', e.message);
    return { started: false, error: e.message };
  }
};

const acceptOffer = async (offerId, riderId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [offerRows] = await connection.query(
      `SELECT * FROM rider_order_offers WHERE id = ? FOR UPDATE`,
      [offerId]
    );
    const offer = offerRows[0];
    if (!offer) {
      await connection.rollback();
      return { ok: false, code: 'NOT_FOUND', message: 'Offer not found' };
    }
    if (Number(offer.rider_id) !== Number(riderId)) {
      await connection.rollback();
      return { ok: false, code: 'FORBIDDEN', message: 'Not your offer' };
    }
    if (offer.status !== 'pending') {
      await connection.rollback();
      return { ok: false, code: 'CONFLICT', message: 'Offer is no longer pending', status: 409 };
    }
    if (new Date(offer.expires_at).getTime() <= Date.now()) {
      await connection.query(
        `UPDATE rider_order_offers
         SET status = 'expired', responded_at = NOW(), reject_reason = 'timeout'
         WHERE id = ? AND status = 'pending'`,
        [offerId]
      );
      await connection.commit();
      // Continue outside
      setImmediate(() => continueAssignment(offer.order_id).catch(() => {}));
      return { ok: false, code: 'CONFLICT', message: 'Offer expired', status: 409 };
    }

    const [orderRows] = await connection.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [offer.order_id]
    );
    const order = orderRows[0];
    if (!order || order.status === 'Cancelled' || order.rider_id) {
      await connection.rollback();
      return { ok: false, code: 'CONFLICT', message: 'Order not assignable', status: 409 };
    }

    await connection.query(
      `UPDATE rider_order_offers
       SET status = 'accepted', responded_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [offerId]
    );
    await connection.query(
      `UPDATE orders
       SET rider_id = ?, rider_assigned_at = NOW(), rider_assignment_status = 'assigned'
       WHERE id = ?`,
      [riderId, offer.order_id]
    );

    await connection.commit();

    const updated = await loadOrder(offer.order_id);

    try {
      const { emitToCustomer, emitToAdmins } = require('../realtime/socket');
      emitToCustomer(updated.customer_id, 'rider.assignment.updated', {
        orderId: updated.id,
        riderId,
        status: 'assigned',
      });
      emitToAdmins('admin.order.rider_updated', {
        orderId: updated.id,
        riderId,
        status: 'assigned',
      });
    } catch (_) { /* best-effort */ }

    // Customer + shop notifications — rider assigned
    try {
      const notificationService = require('../utils/notificationService');
      const realtimeEvents = require('../realtime/orderEvents');
      notificationService.createOrderNotification({
        userId: updated.customer_id,
        order: updated,
        event: 'rider_assigned',
      }).then((result) => {
        if (result) realtimeEvents.emitNotificationCreated(updated.customer_id, result);
      }).catch(() => {});
      const { notifyShopsRiderAssigned } = require('../utils/shops');
      notifyShopsRiderAssigned(updated);
    } catch (_) { /* best-effort */ }

    log('acceptOffer', { offerId, orderId: offer.order_id, riderId });
    return { ok: true, order: updated };
  } catch (e) {
    await connection.rollback();
    console.error('[rider-assign] acceptOffer failed:', e.message);
    return { ok: false, code: 'INTERNAL', message: e.message, status: 500 };
  } finally {
    connection.release();
  }
};

const rejectOffer = async (offerId, riderId, rejectReason = 'manual') => {
  const connection = await pool.getConnection();
  let orderId = null;
  try {
    await connection.beginTransaction();
    const [offerRows] = await connection.query(
      `SELECT * FROM rider_order_offers WHERE id = ? FOR UPDATE`,
      [offerId]
    );
    const offer = offerRows[0];
    if (!offer) {
      await connection.rollback();
      return { ok: false, code: 'NOT_FOUND', message: 'Offer not found' };
    }
    if (Number(offer.rider_id) !== Number(riderId)) {
      await connection.rollback();
      return { ok: false, code: 'FORBIDDEN', message: 'Not your offer' };
    }
    if (offer.status !== 'pending') {
      await connection.rollback();
      return { ok: false, code: 'CONFLICT', message: 'Offer is no longer pending', status: 409 };
    }
    orderId = offer.order_id;
    await connection.query(
      `UPDATE rider_order_offers
       SET status = 'rejected', responded_at = NOW(), reject_reason = ?
       WHERE id = ? AND status = 'pending'`,
      [rejectReason, offerId]
    );
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    console.error('[rider-assign] rejectOffer failed:', e.message);
    return { ok: false, code: 'INTERNAL', message: e.message, status: 500 };
  } finally {
    connection.release();
  }

  const cont = await continueAssignment(orderId);
  log('rejectOffer', { offerId, orderId, cont });
  return { ok: true, continued: cont };
};

/**
 * Expire a single pending offer if past expires_at (CAS).
 */
const expireOffer = async (offerId) => {
  const [result] = await pool.query(
    `UPDATE rider_order_offers
     SET status = 'expired', responded_at = NOW(), reject_reason = 'timeout'
     WHERE id = ? AND status = 'pending' AND expires_at <= NOW()`,
    [offerId]
  );
  if (result.affectedRows === 0) return { expired: false };

  const [rows] = await pool.query('SELECT order_id, rider_id FROM rider_order_offers WHERE id = ?', [offerId]);
  const offer = rows[0];
  if (offer) {
    try {
      const [riderRows] = await pool.query('SELECT user_id FROM riders WHERE id = ?', [offer.rider_id]);
      if (riderRows[0]) {
        const { emitToCustomer } = require('../realtime/socket');
        emitToCustomer(riderRows[0].user_id, 'rider.offer.expired', {
          offerId,
          orderId: offer.order_id,
        });
      }
    } catch (_) { /* best-effort */ }
    await continueAssignment(offer.order_id);
  }
  log('expireOffer', { offerId, orderId: offer?.order_id });
  return { expired: true, orderId: offer?.order_id };
};

/**
 * Sweep all due pending offers.
 */
const expireDueOffers = async () => {
  const [rows] = await pool.query(
    `SELECT id FROM rider_order_offers
     WHERE status = 'pending' AND expires_at <= NOW()
     ORDER BY expires_at ASC
     LIMIT 50`
  );
  const results = [];
  for (const row of rows) {
    results.push(await expireOffer(row.id));
  }
  return results;
};

/**
 * Rider cancels after accept, before pickup. Treat as reject → reassignment.
 */
const cancelAssignmentByRider = async (orderId, riderId) => {
  const order = await loadOrder(orderId);
  if (!order) {
    return { ok: false, code: 'NOT_FOUND', message: 'Order not found', status: 404 };
  }
  if (Number(order.rider_id) !== Number(riderId)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Not your assignment', status: 403 };
  }
  if (order.rider_picked_up_at) {
    return {
      ok: false,
      code: 'CANNOT_CANCEL_AFTER_PICKUP',
      message: 'Cannot cancel after pickup',
      status: 400,
    };
  }
  if (order.status === 'Out for Delivery' || order.status === 'Delivered' || order.status === 'Cancelled') {
    return { ok: false, code: 'CONFLICT', message: 'Order cannot be unassigned', status: 409 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE orders
       SET rider_id = NULL,
           rider_assigned_at = NULL,
           rider_assignment_status = 'searching'
       WHERE id = ? AND rider_id = ?`,
      [orderId, riderId]
    );
    // Same accepted offer row → rejected with post_accept_cancel (no second insert)
    await connection.query(
      `UPDATE rider_order_offers
       SET status = 'rejected',
           responded_at = NOW(),
           reject_reason = 'post_accept_cancel'
       WHERE order_id = ? AND rider_id = ? AND status = 'accepted'`,
      [orderId, riderId]
    );
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    console.error('[rider-assign] cancelAssignmentByRider failed:', e.message);
    return { ok: false, code: 'INTERNAL', message: e.message, status: 500 };
  } finally {
    connection.release();
  }

  const cont = await continueAssignment(orderId);
  log('cancelAssignmentByRider', { orderId, riderId, cont });
  return { ok: true, continued: cont };
};

/**
 * Revoke pending offers when order is cancelled externally.
 */
const revokeOffersForOrder = async (orderId) => {
  try {
    const queryResult = await pool.query(
      `SELECT o.id AS offer_id, o.rider_id, r.user_id
       FROM rider_order_offers o
       JOIN riders r ON r.id = o.rider_id
       WHERE o.order_id = ? AND o.status = 'pending'`,
      [orderId]
    );
    const pending = Array.isArray(queryResult?.[0]) ? queryResult[0] : [];
    await pool.query(
      `UPDATE rider_order_offers
       SET status = 'cancelled', responded_at = NOW(), reject_reason = 'admin'
       WHERE order_id = ? AND status = 'pending'`,
      [orderId]
    );
    const { emitToCustomer } = require('../realtime/socket');
    for (const row of pending) {
      emitToCustomer(row.user_id, 'rider.offer.revoked', {
        offerId: row.offer_id,
        orderId,
      });
    }
  } catch (e) {
    console.error('[rider-assign] revokeOffersForOrder failed:', e.message);
  }
};

module.exports = {
  RIDER_OFFER_TIMEOUT_SEC,
  startAssignment,
  startAssignmentIfHouseOnly,
  maybeStartRiderAssignment,
  createOffer,
  acceptOffer,
  rejectOffer,
  expireOffer,
  expireDueOffers,
  failAssignment,
  cancelAssignmentByRider,
  continueAssignment,
  getExcludedRiderIdsForOrder,
  revokeOffersForOrder,
};
