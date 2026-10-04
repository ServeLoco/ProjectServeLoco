// The two cart facts the coupon engine needs besides money: how many items
// the cart holds (min_item_count) and which store type it is (applies_to).
// Shared by the cart preview and order creation so a coupon the cart shows
// as applied is judged on the same inputs when the order is placed.

// Total quantity across the priced lines.
const cartItemCount = (lines) => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

// The cart's single store type (categories.type for products,
// combos.store_type for combos), 'mixed' when the lines span several types
// — only applies_to = 'all' coupons match that — or null when no line's
// type is known, which skips the store-type check.
const cartStoreType = (types) => {
  const distinct = new Set();
  for (const type of types) if (type) distinct.add(type);
  if (distinct.size === 1) return [...distinct][0];
  if (distinct.size > 1) return 'mixed';
  return null;
};

module.exports = {
  cartItemCount,
  cartStoreType,
};
