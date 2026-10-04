import { useCallback, useMemo, useState } from 'react';
import { useCartStore } from '../stores';
import { useAuthGate } from './useAuthGate';
import { showToast } from '../components/Toast';
import { normalizeProduct } from '../utils/apiMappers';
import { cartLineKey, dealItemKey, estimateDealProgress, indexDealItems, isDealLine } from '../utils/dealCart';

const keyOfItem = (item) => dealItemKey(item.id, item.dealVariantId ?? item.deal_variant_id ?? null);

const variantOf = (item) => {
  const variantId = item.dealVariantId ?? item.deal_variant_id ?? null;
  if (variantId == null) return null;
  return (item.variants || []).find((v) => String(v.id) === String(variantId)) || null;
};

/**
 * Cart side of a deal card / the Deal page: which deal items are already in
 * the cart, how far the cart is from unlocking the deal, and the Select
 * action (adds one unit; when the deal's "any N items" are already taken it
 * offers to swap the last one out, like Instamart).
 *
 * Select marks the cart line with the deal's id, and only marked lines get
 * the deal price — the same product added from a normal list does not.
 */
export function useDealCart(deal) {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const setLineDeal = useCartStore((s) => s.setLineDeal);
  const { requireAuth } = useAuthGate();
  const dealId = deal?.id ?? null;
  // The pending "replace X with Y?" question, shown by DealSwapModal.
  const [swapAsk, setSwapAsk] = useState(null);

  const index = useMemo(() => indexDealItems(deal), [deal]);
  const progress = useMemo(() => estimateDealProgress(items, deal, index), [items, deal, index]);
  const picked = useMemo(
    () => items.filter((l) => (l.type || 'product') !== 'combo' && isDealLine(l, dealId)),
    [items, dealId],
  );
  const inCart = useMemo(() => new Set(picked.map(cartLineKey)), [picked]);

  const isSelected = useCallback((item) => inCart.has(keyOfItem(item)), [inCart]);

  // Takes the deal unit back out: one unit less, and the rest of the line
  // (if any was added normally) goes back to the normal price.
  const dropOne = useCallback((line) => {
    const qty = Number(line.quantity) || 0;
    const variantId = line.variant?.id ?? null;
    if (qty <= 1) {
      removeItem(line.product.id, 'product', variantId);
      return;
    }
    updateQuantity(line.product.id, qty - 1, 'product', variantId);
    setLineDeal(line.product.id, variantId, null);
  }, [removeItem, updateQuantity, setLineDeal]);

  const add = useCallback((item) => {
    const product = normalizeProduct(item);
    const price = Number(item.dealPrice ?? item.deal_price);
    addItem(product, 1, variantOf(product), { dealCouponId: dealId, dealPrice: Number.isFinite(price) ? price : null });
    showToast(`${product.name} added — ₹${price} deal`, { type: 'success' });
  }, [addItem, dealId]);

  const toggle = useCallback((item) => {
    requireAuth(null, () => {
      const key = keyOfItem(item);
      const existing = picked.find((l) => cartLineKey(l) === key);
      if (existing) {
        dropOne(existing);
        return;
      }
      if (progress.dealUnits >= progress.maxItems && progress.dealLines.length > 0) {
        const out = progress.dealLines[progress.dealLines.length - 1];
        setSwapAsk({ out, item });
        return;
      }
      add(item);
    });
  }, [requireAuth, picked, progress, dropOne, add]);

  const cancelSwap = useCallback(() => setSwapAsk(null), []);
  const confirmSwap = useCallback(() => {
    if (!swapAsk) return;
    setSwapAsk(null);
    dropOne(swapAsk.out);
    add(swapAsk.item);
  }, [swapAsk, dropOne, add]);

  // What DealSwapModal draws: the item going out and the one coming in.
  const swap = useMemo(() => {
    if (!swapAsk) return null;
    const { out, item } = swapAsk;
    const outDeal = index.get(cartLineKey(out));
    const outProduct = out.product || {};
    return {
      count: progress.maxItems,
      out: {
        name: outProduct.name || 'Current item',
        image: outProduct.thumbUrl || outProduct.imageUrl || outProduct.image,
        price: out.dealPrice ?? outDeal?.dealPrice,
        regular: out.variant?.price ?? outProduct.price,
      },
      in: {
        name: item.name,
        image: item.thumbUrl || item.imageUrl,
        price: item.dealPrice ?? item.deal_price,
        regular: item.regularPrice ?? item.regular_price,
      },
    };
  }, [swapAsk, index, progress.maxItems]);

  return { progress, isSelected, toggle, swap, confirmSwap, cancelSwap };
}

export default useDealCart;
