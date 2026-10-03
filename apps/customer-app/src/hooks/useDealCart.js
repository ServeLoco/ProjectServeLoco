import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
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
    addItem(product, 1, variantOf(product), { dealCouponId: dealId });
    const price = Number(item.dealPrice ?? item.deal_price);
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
        const count = progress.maxItems;
        Alert.alert(
          'Swap your deal item?',
          `This offer gives ${count} item${count === 1 ? '' : 's'} at the deal price. Replace ${out.product?.name || 'the current item'} with ${item.name}?`,
          [
            { text: 'Keep current', style: 'cancel' },
            { text: 'Replace', onPress: () => { dropOne(out); add(item); } },
          ],
        );
        return;
      }
      add(item);
    });
  }, [requireAuth, picked, progress, dropOne, add]);

  return { progress, isSelected, toggle };
}

export default useDealCart;
