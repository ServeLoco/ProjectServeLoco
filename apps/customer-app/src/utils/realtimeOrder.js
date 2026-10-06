function getRealtimeOrderId(payload = {}) {
  const id = payload.orderId || payload.order_id || payload.id;
  return id === undefined || id === null ? null : String(id);
}

function getRealtimeOrderKey(eventName, payload = {}) {
  return [
    eventName,
    getRealtimeOrderId(payload),
    payload.status || '',
    payload.paymentStatus || payload.payment_status || '',
    payload.updatedAt || payload.updated_at || '',
    payload.total ?? '',
    payload.action || '',
    payload.billingRevision ?? payload.billing_revision ?? '',
  ].join(':');
}

function getCancelledPaymentStatus(paymentMethod) {
  return paymentMethod === 'UPI' ? 'Refunded' : 'Failed';
}

function mergeOrderRealtimePatch(order, payload = {}) {
  if (!order) return order;
  const revision = payload.billingRevision ?? payload.billing_revision;
  if (revision != null && Number(revision) < Number(order.billingRevision ?? order.billing_revision ?? 0)) return order;

  const next = { ...order };
  if (revision != null) { next.billingRevision = revision; next.billing_revision = revision; }
  const status = payload.status;
  const paymentStatus = payload.paymentStatus || payload.payment_status;
  const updatedAt = payload.updatedAt || payload.updated_at;

  if (status !== undefined && status !== null) {
    next.status = status;
    next.canCancel = status === 'Pending';
    if (status === 'Cancelled' && (paymentStatus === undefined || paymentStatus === null)) {
      const paymentMethod = payload.paymentMethod || payload.payment_method || next.paymentMethod || next.payment_method;
      next.paymentStatus = getCancelledPaymentStatus(paymentMethod);
      next.payment_status = next.paymentStatus;
    }
  }

  if (paymentStatus !== undefined && paymentStatus !== null) {
    next.paymentStatus = paymentStatus;
    next.payment_status = paymentStatus;
  }

  if (payload.total != null) {
    next.total = Number(payload.total);
    next.bill = { ...next.bill, grandTotal: Number(payload.total) };
  }
  if (payload.items) next.items = payload.items.map(item => ({ ...item, name: item.name || item.product_name || item.productName, price: Number(item.unit_price ?? item.unitPrice ?? item.price ?? 0) }));
  const billFields = { subtotal: 'subtotal', delivery_charge: 'delivery', fast_delivery_charge: 'fastDeliveryFee',
    night_charge: 'nightCharge', rain_charge: 'rainCharge', discount_amount: 'discount',
    deal_discount_amount: 'dealDiscount', free_delivery_waiver_amount: 'freeDeliveryWaiver' };
  for (const [source, target] of Object.entries(billFields)) {
    if (payload[source] != null) next.bill = { ...next.bill, [target]: Number(payload[source]) };
  }
  if (payload.discount_amount != null || payload.free_delivery_waiver_amount != null) {
    next.bill.itemDiscount = Math.max(0, (next.bill.discount || 0) - (next.bill.freeDeliveryWaiver || 0));
  }
  if (payload.free_delivery_waiver_amount != null) {
    next.bill.freeDeliveryApplied = Number(payload.free_delivery_waiver_amount) > 0;
  }

  const cancelReason = payload.cancelReason ?? payload.cancel_reason;
  if (cancelReason !== undefined && cancelReason !== null) {
    next.cancelReason = cancelReason;
    next.cancel_reason = cancelReason;
  }

  if (updatedAt) {
    next.date = updatedAt;
    next.updatedAt = updatedAt;
    next.updated_at = updatedAt;
  }

  return next;
}

function isRecentRealtimeEvent(cacheRef, key, windowMs = 500) {
  if (!key) return false;

  const now = Date.now();
  const cache = cacheRef.current || {};
  cacheRef.current = cache;

  Object.keys(cache).forEach(cacheKey => {
    if (now - cache[cacheKey] > windowMs) {
      delete cache[cacheKey];
    }
  });

  if (cache[key] && now - cache[key] <= windowMs) {
    return true;
  }

  cache[key] = now;
  return false;
}

// ADMIN TASK 9 — same shape as apps/admin/src/utils/realtimeOrder.js's
// mergeAdminOrderPatch (dual-case status/paymentStatus, no customer-only
// fields like canCancel/date) so the mobile Orders list merges live socket
// patches identically to the web admin panel.
function mergeAdminOrderPatch(order, payload = {}) {
  if (!order) return order;
  const revision = payload.billingRevision ?? payload.billing_revision;
  if (revision != null && Number(revision) < Number(order.billingRevision ?? order.billing_revision ?? 0)) return order;

  const next = { ...order };
  if (revision != null) { next.billingRevision = revision; next.billing_revision = revision; }
  const status = payload.status;
  const paymentStatus = payload.paymentStatus || payload.payment_status;
  const updatedAt = payload.updatedAt || payload.updated_at;

  if (status !== undefined && status !== null) {
    next.status = status;
  }

  if (paymentStatus !== undefined && paymentStatus !== null) {
    next.payment_status = paymentStatus;
    next.paymentStatus = paymentStatus;
  }

  if (payload.total !== undefined && payload.total !== null) {
    next.total = payload.total;
  }

  if (payload.subtotal !== undefined && payload.subtotal !== null) {
    next.subtotal = payload.subtotal;
  }

  for (const key of ['delivery_charge', 'fast_delivery_charge', 'night_charge', 'rain_charge',
    'discount_amount', 'deal_discount_amount', 'free_delivery_waiver_amount']) {
    const alias = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = payload[key] ?? payload[alias];
    if (value != null) { next[key] = value; next[alias] = value; }
  }

  if (payload.items) next.items = payload.items;

  // admin.order.item_replaced — swap the matching order_items row in place,
  // same as the web admin panel's mergeAdminOrderPatch.
  if (payload.itemId != null && payload.newProduct && Array.isArray(next.items)) {
    const itemId = Number(payload.itemId);
    next.items = next.items.map((it) => (
      Number(it.id) === itemId
        ? {
          ...it,
          product_id: payload.newProduct.productId,
          product_name: payload.newProduct.productName,
          unit_price: payload.newProduct.unitPrice,
          line_total: payload.newProduct.lineTotal,
        }
        : it
    ));
  }

  if (updatedAt) {
    next.updated_at = updatedAt;
    next.updatedAt = updatedAt;
  }

  if (payload.orderNumber && !next.order_number) {
    next.order_number = payload.orderNumber;
  }

  return next;
}

export {
  getRealtimeOrderId,
  getRealtimeOrderKey,
  isRecentRealtimeEvent,
  mergeAdminOrderPatch,
  mergeOrderRealtimePatch,
};
