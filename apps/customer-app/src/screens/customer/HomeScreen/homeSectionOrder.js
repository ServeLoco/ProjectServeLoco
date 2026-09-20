import { normalizeProduct } from '../../../utils';

// normalizeProduct builds a fresh object every call. Caching by the raw item
// keeps each card's props identical between renders, so a cart change only
// re-renders the card whose quantity changed. A live patch (price, shop
// closed) replaces the raw item, which drops it out of the cache — the card
// then re-renders with the new name/price straight away.
const normalizedProductCache = new WeakMap();
export function normalizeProductCached(raw) {
  if (!raw || typeof raw !== 'object') return normalizeProduct(raw);
  let normalized = normalizedProductCache.get(raw);
  if (!normalized) {
    normalized = normalizeProduct(raw);
    normalizedProductCache.set(raw, normalized);
  }
  return normalized;
}

// A product the card would show as unavailable: turned off, or its shop is closed.
export const isProductUnavailable = (p) =>
  !p.available || p.shopIsOpen === false || p.shop_is_open === false;

// A product/combo section whose items are ALL unavailable.
export function isSectionAllUnavailable(section) {
  if (section?.sectionType !== 'product_block' && section?.sectionType !== 'combo_block') return false;
  const items = Array.isArray(section.items) ? section.items : [];
  return items.length > 0 && items.every((raw) => isProductUnavailable(normalizeProductCached(raw)));
}

/**
 * The order Home draws its sections in, top to bottom.
 *
 * The dashboard already returns the sections in the order the admin set on
 * App Home (the rows Home creates by itself — a row per shop / category,
 * flagged `auto` — are ordinary sections in that list, at the end unless the
 * admin dragged them elsewhere). This keeps that order, with one exception:
 * a section with NOTHING available goes to the very end. Inside each of the
 * two groups the admin's order is kept exactly — so when everything is
 * unavailable (shop closed) the page is simply the admin's order, top to
 * bottom.
 *
 * Whether an automatic row has nothing available is answered by the server
 * (`allUnavailable`), and a manual section's answer comes from its items in
 * the same payload — so the order is settled before anything is drawn and
 * never reshuffles while rows load.
 */
export function orderHomeUnits(sections) {
  const available = [];
  const unavailable = [];
  for (const section of sections || []) {
    const isAuto = Boolean(section.auto);
    const allUnavailable = isAuto
      ? Boolean(section.allUnavailable)
      : isSectionAllUnavailable(section);
    (allUnavailable ? unavailable : available)
      .push(isAuto ? { kind: 'auto', auto: section } : { kind: 'section', section });
  }
  return [...available, ...unavailable];
}
