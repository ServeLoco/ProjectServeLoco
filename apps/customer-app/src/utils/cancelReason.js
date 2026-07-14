/**
 * Customer-facing cancel reason for Track Order.
 * Maps legacy internal strings and normalizes dual-case API fields.
 */

const SHOPS_UNAVAILABLE =
  'Sorry, the items on this order are currently unavailable. Please try ordering again.';
const CUSTOMER = 'You cancelled this order.';
const ADMIN_DEFAULT = 'This order was cancelled by the store.';
const FALLBACK = 'This order was cancelled.';

/**
 * @param {string|null|undefined} raw - orders.cancel_reason from API
 * @returns {string} message to show under "Order Cancelled"
 */
export function formatCancelReasonForCustomer(raw) {
  if (raw == null || String(raw).trim() === '') return FALLBACK;
  const r = String(raw).trim();
  const lower = r.toLowerCase();

  if (
    lower.includes('all shops rejected')
    || lower.includes('shop rejected')
    || (lower.includes('items') && lower.includes('unavailable'))
  ) {
    // Prefer stored friendly text if already new format
    if (lower.startsWith('sorry')) return r;
    return SHOPS_UNAVAILABLE;
  }
  if (lower === 'cancelled by customer' || lower === 'canceled by customer') {
    return CUSTOMER;
  }
  if (lower === 'you cancelled this order.') return CUSTOMER;
  if (lower === 'cancelled by admin' || lower === 'canceled by admin') {
    return ADMIN_DEFAULT;
  }
  // Admin-typed free text (or any other stored message)
  return r;
}

export function pickCancelReason(order = {}) {
  return order.cancelReason ?? order.cancel_reason ?? null;
}
