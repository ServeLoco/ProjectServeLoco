import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trackEvent } from '../api/analyticsClient';

/**
 * useCartStore
 * Local cart state. Prices here are display-only until verified by backend.
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [], // Array of { product, quantity, type: 'product' | 'combo' }

      // Coupon state — survives navigation from cart to checkout.
      appliedCouponCode: null,
      // Coupon id, kept alongside the code since auto-apply-only offers can
      // have code = null — the id is the only reliable, always-present way
      // to identify *which* offer is applied (used to force-apply a specific
      // no-code offer instead of falling back to "the best one").
      appliedCouponId: null,
      appliedCoupon: null,
      // True once the user has explicitly removed a coupon, so the backend
      // knows NOT to silently auto-apply the next-best offer on the very
      // next bill recalculation (otherwise "remove" would appear to do
      // nothing, since the discount would just reappear from another coupon).
      couponAutoApplyDisabled: false,
      // When `coupon.autoApplied` is true, this sync came from the backend
      // silently picking the best auto-apply offer — NOT from the user
      // choosing a specific coupon. In that case we must not remember its
      // code/id, or every future recalculation would force-reapply this
      // exact coupon (via coupon_code/coupon_id) instead of letting the
      // backend re-run "pick best" as the cart total/items change, which
      // would permanently lock the customer onto whichever offer happened
      // to be auto-applied first.
      setAppliedCoupon: (code, coupon) => set({
        appliedCouponCode: coupon?.autoApplied ? null : code,
        appliedCouponId: coupon?.autoApplied ? null : (coupon?.id ?? null),
        appliedCoupon: coupon,
        couponAutoApplyDisabled: false,
      }),
      clearAppliedCoupon: () => set({ appliedCouponCode: null, appliedCouponId: null, appliedCoupon: null, couponAutoApplyDisabled: true }),

      // Last known "add ₹X more for free delivery" progress from the most
      // recent cart-calculate call (Cart/Checkout screens). Used by
      // StickyMiniCart for a lightweight hint elsewhere in the app; may be
      // stale/absent until the user has opened the cart this session.
      freeDeliveryProgress: null,
      setFreeDeliveryProgress: (progress) => set({ freeDeliveryProgress: progress || null }),

      // addItem now accepts an optional variant. When a variant is provided,
      // two items with the same product but different variants are SEPARATE
      // cart lines (e.g. 2× Veg + 1× Chicken). When no variant, matches the
      // legacy single-line behavior (variant === null matches null).
      addItem: (product, quantity = 1, variant = null) => {
        const { items } = get();
        const variantId = variant?.id ?? null;
        const existingItemIndex = items.findIndex((item) =>
          item.product.id === product.id &&
          item.type !== 'combo' &&
          (item.variant?.id ?? null) === variantId
        );

        if (existingItemIndex >= 0) {
          const updatedItems = [...items];
          updatedItems[existingItemIndex] = {
            ...updatedItems[existingItemIndex],
            quantity: updatedItems[existingItemIndex].quantity + quantity,
          };
          set({ items: updatedItems });
        } else {
          set({ items: [...items, { product, quantity, type: 'product', variant: variant || null }] });
        }
        trackEvent('cart_add', { productId: Number(product.id), qty: quantity, price: Number(variant?.price ?? product?.price) || 0 });
      },

      addCombo: (combo, quantity = 1) => {
        const { items } = get();
        const existingItemIndex = items.findIndex((item) => item.product.id === combo.id && item.type === 'combo');

        if (existingItemIndex >= 0) {
          const updatedItems = [...items];
          updatedItems[existingItemIndex] = {
            ...updatedItems[existingItemIndex],
            quantity: updatedItems[existingItemIndex].quantity + quantity,
          };
          set({ items: updatedItems });
        } else {
          set({ items: [...items, { product: combo, quantity, type: 'combo' }] });
        }
      },

      decrementCombo: (combo) => {
        const current = get().items.find(item => item.product.id === combo.id && item.type === 'combo')?.quantity || 0;
        get().updateQuantity(combo.id, current - 1, 'combo');
      },

      getComboQuantity: (combo) => {
        return get().items.find(item => item.product.id === combo?.id && item.type === 'combo')?.quantity || 0;
      },

      removeItem: (productId, type = 'product', variantId = null) => {
        const { items } = get();
        const removed = items.find(i => String(i.product.id) === String(productId) && (i.type || 'product') === type && (i.variant?.id ?? null) === (variantId ?? null));
        set({ items: items.filter((item) =>
          !(item.product.id === productId &&
            (item.type || 'product') === type &&
            (item.variant?.id ?? null) === (variantId ?? null))
        ) });
        trackEvent('cart_remove', { productId: Number(productId), qty: Number(removed?.quantity) || 0, price: Number(removed?.variant?.price ?? removed?.product?.price) || 0 });
      },

      updateQuantity: (productId, quantity, type = 'product', variantId = null) => {
        const { items } = get();
        if (quantity <= 0) {
          get().removeItem(productId, type, variantId);
          return;
        }

        const existing = items.find(item =>
          item.product.id === productId &&
          (item.type || 'product') === type &&
          (item.variant?.id ?? null) === (variantId ?? null)
        );
        const previousQty = existing?.quantity || 0;
        const delta = quantity - previousQty;

        const updatedItems = items.map((item) => {
          if (item.product.id === productId &&
              (item.type || 'product') === type &&
              (item.variant?.id ?? null) === (variantId ?? null)) {
            return { ...item, quantity };
          }
          return item;
        });

        set({ items: updatedItems });

        if (type === 'product' && delta !== 0 && existing) {
          const price = Number(existing.variant?.price ?? existing.product?.price) || 0;
          trackEvent(delta > 0 ? 'cart_add' : 'cart_remove', { productId: Number(productId), qty: Math.abs(delta), price });
        }
      },

      clearCart: () => set({ items: [], appliedCouponCode: null, appliedCouponId: null, appliedCoupon: null, couponAutoApplyDisabled: false }),

      // Drops every cart line whose product belongs to a shop that just
      // closed (or went inactive). Combos and house products (shopId null)
      // are never shop-scoped and are left alone. Returns the removed items
      // so the caller can show a toast — silent removal would look like the
      // items vanished for no reason.
      removeItemsByShop: (shopId) => {
        const { items } = get();
        const targetId = String(shopId);
        const removedItems = items.filter(item => String(item.product?.shopId ?? item.product?.shop_id ?? '') === targetId);
        if (removedItems.length === 0) return [];

        set({ items: items.filter(item => String(item.product?.shopId ?? item.product?.shop_id ?? '') !== targetId) });
        removedItems.forEach(item => {
          trackEvent('cart_remove', {
            productId: Number(item.product.id),
            qty: Number(item.quantity) || 0,
            price: Number(item.variant?.price ?? item.product?.price) || 0,
            reason: 'shop_closed',
          });
        });
        return removedItems;
      },

      // Selectors (computed properties)
      get totalItems() {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },

      get displayTotal() {
        return get().items.reduce((total, item) => {
          const price = Number(item?.variant?.price ?? item?.product?.price) || 0;
          const qty = Number(item?.quantity) || 0;
          return total + price * qty;
        }, 0);
      },

      // Total quantity across ALL variants of a product (for the card badge).
      // Combos are excluded — they use getComboQuantity.
      getProductQuantity: (productId) => {
        return get().items
          .filter(item =>
            String(item.product.id) === String(productId) &&
            (item.type || 'product') !== 'combo'
          )
          .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      },
    }),
    {
      name: 'serveloco-cart',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      // couponAutoApplyDisabled is a same-session "user just removed this"
      // signal only — it must not survive an app restart, otherwise removing
      // a coupon once permanently blocks auto-apply on this device until the
      // cart happens to be cleared.
      partialize: (state) => {
        const { couponAutoApplyDisabled, ...rest } = state;
        return rest;
      },
      // Strip stale/corrupt items from older app versions so legacy entries
      // (missing id, non-numeric price, missing type) don't blow up calculations.
      migrate: (persistedState) => {
        const state = persistedState || {};
        const cleanItems = Array.isArray(state.items)
          ? state.items
              .filter(item => item && item.product && item.product.id !== undefined && item.product.id !== null)
              .map(item => ({
                ...item,
                quantity: Number(item.quantity) || 0,
                type: item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product'),
                // Stamp variant: null on legacy items so variant-aware logic
                // doesn't crash on old persisted carts (version 2 → 3 bump).
                variant: item.variant ?? null,
                product: {
                  ...item.product,
                  id: String(item.product.id),
                  price: Number(item.product.price) || 0,
                },
              }))
              .filter(item => item.quantity > 0)
          : [];
        return { ...state, items: cleanItems };
      },
    }
  )
);

export default useCartStore;