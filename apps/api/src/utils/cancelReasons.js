/**
 * Canonical cancel_reason strings written to orders.cancel_reason.
 * Customer apps display these under "Order Cancelled" on Track Order.
 */

const CUSTOMER = 'You cancelled this order.';
const SHOPS_UNAVAILABLE =
  'Sorry, the items on this order are currently unavailable. Please try ordering again.';
const ADMIN_DEFAULT = 'This order was cancelled by the store.';

/**
 * @param {'customer'|'shops'|'admin'} source
 * @param {string|null|undefined} adminReason - free text when admin cancels
 */
const resolveCancelReason = (source, adminReason) => {
  if (source === 'customer') return CUSTOMER;
  if (source === 'shops') return SHOPS_UNAVAILABLE;
  if (source === 'admin') {
    const t = adminReason != null ? String(adminReason).trim() : '';
    if (!t) return ADMIN_DEFAULT;
    // Generic placeholders from older admin UI — use friendly default
    if (/^cancelled by admin$/i.test(t) || /^canceled by admin$/i.test(t)) {
      return ADMIN_DEFAULT;
    }
    return t;
  }
  const t = adminReason != null ? String(adminReason).trim() : '';
  return t || ADMIN_DEFAULT;
};

module.exports = {
  CUSTOMER,
  SHOPS_UNAVAILABLE,
  ADMIN_DEFAULT,
  resolveCancelReason,
};
