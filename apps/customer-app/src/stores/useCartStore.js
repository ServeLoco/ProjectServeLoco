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
      // User explicitly removed a coupon — block silent re-auto-apply on the
      // next bill calc so "remove" is not immediately undone by pick-best.
      clearAppliedCoupon: () => set({ appliedCouponCode: null, appliedCouponId: null, appliedCoupon: null, couponAutoApplyDisabled: true }),
      // Bill recalculation returned no coupon (e.g. free-delivery auto-apply
      // fell below min order after items were removed). Drop the stale green
      // "Applied" row without blocking future auto-apply when the cart rises
      // back over the threshold.
      softClearAppliedCoupon: () => set({
        appliedCouponCode: null,
        appliedCouponId: null,
        appliedCoupon: null,
      }),

      // Last known "add ₹X more for free delivery" progress from cart/calculate
      // (Cart/Checkout + useSyncCartFreeDeliveryProgress on shopping screens).
      // StickyMiniCart re-derives remaining amount/items from live cart totals
      // so the pill stays realtime between API round-trips.
      freeDeliveryProgress: null,
      setFreeDeliveryProgress: (progress) => set({ freeDeliveryProgress: progress || null }),
      // True when the latest bill has free delivery applied (waiver > 0).
      freeDeliveryUnlocked: false,
      setFreeDeliveryUnlocked: (unlocked) => set({ freeDeliveryUnlocked: Boolean(unlocked) }),

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

      clearCart: () => set({
        items: [],
        appliedCouponCode: null,
        appliedCouponId: null,
        appliedCoupon: null,
        couponAutoApplyDisabled: false,
        freeDeliveryProgress: null,
        freeDeliveryUnlocked: false,
      }),

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

      // Write live unit prices from /cart/calculate back into local cart lines.
      // Quantities stay client-owned (server only echoes them); we never overwrite
      // qty here. Only mutates when a price actually differs so `items` deps
      // don't loop. After this, sticky total = sum(price * quantity) is live.
      // serverItems: [{ id, unitPrice, type?, variantId? }, ...]
      syncItemPricesFromServer: (serverItems) => {
        if (!Array.isArray(serverItems) || serverItems.length === 0) return false;

        const priceByKey = new Map();
        for (const row of serverItems) {
          const id = row?.id ?? row?.productId ?? row?.product_id;
          if (id == null || id === '') continue;
          const type = row?.type || (row?.isCombo || row?.is_combo ? 'combo' : 'product');
          const variantId = row?.variantId ?? row?.variant_id ?? null;
          const unitPrice = Number(row?.unitPrice ?? row?.unit_price ?? row?.price);
          if (!Number.isFinite(unitPrice)) continue;
          priceByKey.set(`${type}:${String(id)}:${variantId == null ? 'base' : String(variantId)}`, unitPrice);
        }
        if (priceByKey.size === 0) return false;

        const { items } = get();
        let changed = false;
        const updatedItems = items.map((item) => {
          const type = item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product');
          const variantId = item.variant?.id ?? null;
          const key = `${type}:${String(item.product?.id)}:${variantId == null ? 'base' : String(variantId)}`;
          if (!priceByKey.has(key)) return item;

          const unitPrice = priceByKey.get(key);
          // Preserve quantity exactly — only price fields change.
          if (item.variant) {
            const current = Number(item.variant.price) || 0;
            if (current === unitPrice) return item;
            changed = true;
            return {
              ...item,
              quantity: item.quantity,
              variant: { ...item.variant, price: unitPrice },
              product: { ...item.product, price: unitPrice },
            };
          }

          const current = Number(item.product?.price) || 0;
          if (current === unitPrice) return item;
          changed = true;
          return {
            ...item,
            quantity: item.quantity,
            product: { ...item.product, price: unitPrice },
          };
        });

        if (changed) set({ items: updatedItems });
        return changed;
      },

      // Patch cart line prices (and availability) from fresh catalog product
      // payloads (Home dashboard / ProductList). Quantity is never changed —
      // only unit prices and availability flags so sticky total (price × qty)
      // updates as soon as product data reloads, without waiting for cart open.
      applyCatalogProductPrices: (products) => {
        if (!Array.isArray(products) || products.length === 0) return false;

        const byId = new Map();
        for (const p of products) {
          if (p == null || p.id == null || p.id === '') continue;
          byId.set(String(p.id), p);
        }
        if (byId.size === 0) return false;

        const { items } = get();
        let changed = false;
        const updatedItems = items.map((item) => {
          const catalog = byId.get(String(item.product?.id));
          if (!catalog) return item;

          const type = item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product');
          const catalogAvailable = catalog.available !== undefined && catalog.available !== null
            ? Boolean(catalog.available)
            : item.product?.available;

          if (type === 'combo' || !item.variant) {
            const unitPrice = Number(catalog.price);
            if (!Number.isFinite(unitPrice)) return item;
            const priceSame = (Number(item.product?.price) || 0) === unitPrice;
            const availSame = item.product?.available === catalogAvailable;
            if (priceSame && availSame) return item;
            changed = true;
            return {
              ...item,
              quantity: item.quantity,
              product: {
                ...item.product,
                price: unitPrice,
                available: catalogAvailable,
                name: catalog.name || item.product?.name,
              },
            };
          }

          const catVariant = (catalog.variants || []).find(
            (v) => String(v?.id) === String(item.variant?.id),
          );
          const unitPrice = Number(
            catVariant != null ? catVariant.price : catalog.price,
          );
          if (!Number.isFinite(unitPrice)) return item;
          const variantAvail = catVariant && catVariant.available !== undefined && catVariant.available !== null
            ? Boolean(catVariant.available)
            : item.variant?.available;
          const priceSame = (Number(item.variant?.price) || 0) === unitPrice
            && (Number(item.product?.price) || 0) === unitPrice;
          const availSame = item.product?.available === catalogAvailable
            && item.variant?.available === variantAvail;
          if (priceSame && availSame) return item;
          changed = true;
          return {
            ...item,
            quantity: item.quantity,
            variant: {
              ...item.variant,
              price: unitPrice,
              available: variantAvail,
              label: catVariant?.label || item.variant?.label,
            },
            product: {
              ...item.product,
              price: unitPrice,
              available: catalogAvailable,
              name: catalog.name || item.product?.name,
            },
          };
        });

        if (changed) set({ items: updatedItems });
        return changed;
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
        // Omit session-only flag from persistence (do not use unused destructure).
        const rest = { ...state };
        delete rest.couponAutoApplyDisabled;
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