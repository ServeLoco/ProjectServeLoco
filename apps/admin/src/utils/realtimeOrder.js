export function getRealtimeOrderId(payload = {}) {
  const id = payload.orderId || payload.order_id || payload.id;
  return id === undefined || id === null ? null : String(id);
}

export function getRealtimeOrderKey(eventName, payload = {}) {
  return [
    eventName,
    getRealtimeOrderId(payload),
    payload.status || '',
    payload.paymentStatus || payload.payment_status || '',
    payload.updatedAt || payload.updated_at || '',
  ].join(':');
}

export function isRecentRealtimeEvent(cacheRef, key, windowMs = 500) {
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

export function mergeAdminOrderPatch(order, payload = {}) {
  if (!order) return order;

  const next = { ...order };
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

  if (updatedAt) {
    next.updated_at = updatedAt;
    next.updatedAt = updatedAt;
  }

  if (payload.orderNumber && !next.order_number) {
    next.order_number = payload.orderNumber;
  }

  return next;
}
