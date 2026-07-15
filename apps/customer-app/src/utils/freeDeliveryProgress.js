/**
 * Free-delivery unlock helpers for StickyMiniCart (and any lightweight cart UI).
 *
 * Server `freeDeliveryProgress` is authoritative, but can lag while the user
 * adds/removes items on Home/ProductList. These helpers recompute remaining
 * amount / item count from the live local cart so the pill updates instantly,
 * then the next debounced cart/calculate confirms.
 */

/**
 * @param {object|null} stored - last freeDeliveryProgress from cart/calculate
 * @param {number} subtotal - local cart item total (display prices)
 * @param {number} itemCount - local cart line quantity sum
 * @returns {object|null} live progress, or null when unlocked / unknown
 */
export function liveFreeDeliveryProgress(stored, subtotal = 0, itemCount = 0) {
  if (!stored || typeof stored !== 'object') return null;

  const minOrder = Number(stored.minOrder) || 0;
  const minItemCount = Number(stored.minItemCount) || 0;
  if (minOrder <= 0 && minItemCount <= 0) return null;

  const sub = Number(subtotal) || 0;
  const count = Number(itemCount) || 0;

  const amountRemaining = minOrder > 0
    ? Math.max(0, Math.round((minOrder - sub) * 100) / 100)
    : 0;
  const itemsRemaining = minItemCount > 0
    ? Math.max(0, minItemCount - count)
    : 0;

  // Both gates met → free delivery unlocked (optimistic until API confirms).
  if (amountRemaining <= 0 && itemsRemaining <= 0) {
    return null;
  }

  return {
    minOrder,
    minItemCount,
    amountRemaining,
    itemsRemaining,
    thresholdType: amountRemaining > 0
      ? 'amount'
      : (itemsRemaining > 0 ? 'item_count' : (stored.thresholdType || 'amount')),
  };
}

/**
 * Progress 0–100 toward free delivery.
 * Uses subtotal/minOrder (amount) or itemCount/minItemCount (items).
 */
export function freeDeliveryUnlockPercent(progress, subtotal = 0, itemCount = 0) {
  if (!progress) return 100;
  const minOrder = Number(progress.minOrder) || 0;
  const minItemCount = Number(progress.minItemCount) || 0;
  if (minOrder > 0) {
    return Math.min(100, Math.max(0, ((Number(subtotal) || 0) / minOrder) * 100));
  }
  if (minItemCount > 0) {
    return Math.min(100, Math.max(0, ((Number(itemCount) || 0) / minItemCount) * 100));
  }
  return 0;
}

/**
 * Whether stored progress + live cart means free delivery is already unlocked.
 */
export function isFreeDeliveryUnlocked(stored, live, freeDeliveryUnlockedFlag = false) {
  if (freeDeliveryUnlockedFlag) return true;
  if (!stored) return false;
  const hadThreshold = (Number(stored.minOrder) || 0) > 0
    || (Number(stored.minItemCount) || 0) > 0;
  return hadThreshold && live == null;
}
