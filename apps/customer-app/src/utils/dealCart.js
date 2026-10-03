/**
 * Deal price helpers (the ₹9 / ₹29 / ₹49 offer cards).
 *
 * The server decides what a cart really pays (utils/coupons.js applyBestDeal
 * in the API); these only estimate it from the local cart so the deal card
 * and the Deal page can say "Shop for ₹X more" and "Added" without a round
 * trip. The rule mirrors the server's:
 *  - only the OTHER items count toward the deal's minimum,
 *  - at most `maxItems` units are deal units, biggest saving first, and they
 *    sell at the deal price all together or — below the minimum — are held
 *    out of the bill until the cart unlocks the deal,
 *  - only lines picked from this deal (line.dealCouponId) take part; the same
 *    product added from a normal list keeps its normal price.
 */

// A deal item is a product, plus the option it was priced for (if any).
export const dealItemKey = (productId, variantId) =>
  `${String(productId)}:${variantId == null || variantId === '' ? '' : String(variantId)}`;

export const cartLineKey = (line) => dealItemKey(line?.product?.id, line?.variant?.id ?? null);

/** True when the cart line was picked from this deal (Select). */
export const isDealLine = (line, dealId) =>
  dealId != null && line?.dealCouponId != null && String(line.dealCouponId) === String(dealId);

const unitPriceOf = (line) => Number(line?.variant?.price ?? line?.product?.price) || 0;

/** Every product of a deal payload ({ tiers: [{ price, items }] }), keyed. */
export function indexDealItems(deal) {
  const index = new Map();
  for (const tier of deal?.tiers || []) {
    for (const item of tier.items || []) {
      const variantId = item.dealVariantId ?? item.deal_variant_id ?? null;
      index.set(dealItemKey(item.id, variantId), item);
    }
  }
  return index;
}

/**
 * Estimates the deal on the local cart.
 * @returns {{ othersTotal, amountRemaining, unlocked, ratio, dealUnits, dealLines }}
 */
export function estimateDealProgress(cartItems, deal, index = indexDealItems(deal)) {
  const minOrder = Number(deal?.minOrder ?? deal?.min_order) || 0;
  const maxItems = Math.max(1, Number(deal?.maxItems ?? deal?.max_items) || 1);
  let total = 0;
  const candidates = [];
  const dealLines = [];

  for (const line of cartItems || []) {
    const qty = Number(line?.quantity) || 0;
    const price = unitPriceOf(line);
    total += price * qty;
    if ((line?.type || 'product') === 'combo') continue;
    if (!isDealLine(line, deal?.id)) continue;
    const item = index.get(cartLineKey(line));
    if (!item) continue;
    dealLines.push(line);
    const saving = price - Number(item.dealPrice ?? item.deal_price);
    if (!(saving > 0)) continue;
    for (let u = 0; u < Math.min(qty, maxItems); u += 1) candidates.push({ price, saving });
  }
  candidates.sort((a, b) => (b.saving - a.saving) || (a.price - b.price));

  // Deal units never count toward the minimum; further picks beyond the
  // deal's limit are ordinary items at the normal price.
  const othersTotal = candidates.slice(0, maxItems).reduce((sum, c) => sum - c.price, total);
  const amountRemaining = Math.max(0, Math.ceil(minOrder - othersTotal));
  const dealUnits = dealLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

  return {
    othersTotal,
    amountRemaining,
    unlocked: amountRemaining === 0,
    ratio: minOrder > 0 ? Math.max(0, Math.min(1, othersTotal / minOrder)) : 1,
    dealUnits,
    dealLines,
    maxItems,
  };
}
