import { useCallback } from 'react';
import { useCartStore } from '../stores';
import { useAuthGate } from './useAuthGate';
import { normalizeProduct } from '../utils/apiMappers';

// The option a product offer card names for a product (null: no options).
const offerVariantIdOf = (item) => item?.offerVariantId ?? item?.offer_variant_id ?? null;

const sameLine = (line, item) =>
  (line.type || 'product') !== 'combo'
  && String(line.product?.id) === String(item.id)
  && String(line.variant?.id ?? '') === String(offerVariantIdOf(item) ?? '');

/**
 * Cart side of a product offer card ("Deals of the day", template 2) and its
 * See all page. Each product goes in at its own price, as the option the
 * card names — the card only picks and shows them, there is no offer price.
 */
export function useOfferProductCart() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const { requireAuth } = useAuthGate();

  const quantityOf = useCallback(
    (item) => Number(items.find((line) => sameLine(line, item))?.quantity) || 0,
    [items],
  );

  const add = useCallback((item) => {
    requireAuth(null, () => {
      const product = normalizeProduct(item);
      const variantId = offerVariantIdOf(item);
      const variant = variantId == null
        ? null
        : (product.variants || []).find((v) => String(v.id) === String(variantId)) || null;
      addItem(product, 1, variant);
    });
  }, [requireAuth, addItem]);

  const decrement = useCallback((item) => {
    const line = useCartStore.getState().items.find((l) => sameLine(l, item));
    if (!line) return;
    const qty = Number(line.quantity) || 0;
    const variantId = line.variant?.id ?? null;
    if (qty <= 1) removeItem(line.product.id, 'product', variantId);
    else updateQuantity(line.product.id, qty - 1, 'product', variantId);
  }, [removeItem, updateQuantity]);

  return { quantityOf, add, decrement };
}

export default useOfferProductCart;
