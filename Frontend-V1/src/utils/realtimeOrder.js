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
  ].join(':');
}

function mergeOrderRealtimePatch(order, payload = {}) {
  if (!order) return order;

  const next = { ...order };
  const status = payload.status;
  const paymentStatus = payload.paymentStatus || payload.payment_status;
  const updatedAt = payload.updatedAt || payload.updated_at;

  if (status !== undefined && status !== null) {
    next.status = status;
    next.canCancel = status === 'Pending';
  }

  if (paymentStatus !== undefined && paymentStatus !== null) {
    next.paymentStatus = paymentStatus;
    next.payment_status = paymentStatus;
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

export {
  getRealtimeOrderId,
  getRealtimeOrderKey,
  isRecentRealtimeEvent,
  mergeOrderRealtimePatch,
};
