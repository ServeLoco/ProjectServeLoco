/**
 * Customer-facing cancel reason for Track Order / order detail.
 */

const SHOPS_UNAVAILABLE =
  'Sorry, the items on this order are currently unavailable. Please try ordering again.';
const CUSTOMER = 'You cancelled this order.';
const ADMIN_DEFAULT = 'This order was cancelled by the store.';
const FALLBACK = 'This order was cancelled.';

export function formatCancelReasonForCustomer(raw) {
  if (raw == null || String(raw).trim() === '') return FALLBACK;
  const r = String(raw).trim();
  const lower = r.toLowerCase();

  if (
    lower.includes('all shops rejected')
    || lower.includes('shop rejected')
    || (lower.includes('items') && lower.includes('unavailable'))
  ) {
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
  return r;
}

export function pickCancelReason(order = {}) {
  return order.cancelReason ?? order.cancel_reason ?? null;
}
