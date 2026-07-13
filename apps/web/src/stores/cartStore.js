import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Cart lines: { product, quantity, type: 'product'|'combo', variant: null|{id,label,price,...} }
 * Same product + different variants = separate lines (matches customer-app).
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      appliedCouponCode: null,
      appliedCouponId: null,
      appliedCoupon: null,
      couponAutoApplyDisabled: false,
      freeDeliveryProgress: null,

      setAppliedCoupon: (code, coupon) => set({
        appliedCouponCode: coupon?.autoApplied ? null : code,
        appliedCouponId: coupon?.autoApplied ? null : (coupon?.id ?? null),
        appliedCoupon: coupon,
        couponAutoApplyDisabled: false,
      }),

      clearAppliedCoupon: () => set({
        appliedCouponCode: null,
        appliedCouponId: null,
        appliedCoupon: null,
        couponAutoApplyDisabled: true,
      }),

      setFreeDeliveryProgress: (progress) => set({ freeDeliveryProgress: progress || null }),

      addItem: (product, quantity = 1, variant = null) => {
        const { items } = get();
        const variantId = variant?.id ?? null;
        const existingIndex = items.findIndex(
          (item) =>
            String(item.product.id) === String(product.id) &&
            item.type !== 'combo' &&
            String(item.variant?.id ?? '') === String(variantId ?? '')
        );

        if (existingIndex >= 0) {
          const updated = [...items];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
          };
          set({ items: updated });
          return;
        }

        set({
          items: [
            ...items,
            { product, quantity, type: 'product', variant: variant || null },
          ],
        });
      },

      addCombo: (combo, quantity = 1) => {
        const { items } = get();
        const existingIndex = items.findIndex(
          (item) => String(item.product.id) === String(combo.id) && item.type === 'combo'
        );

        if (existingIndex >= 0) {
          const updated = [...items];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
          };
          set({ items: updated });
          return;
        }

        set({
          items: [...items, { product: combo, quantity, type: 'combo', variant: null }],
        });
      },

      removeItem: (productId, type = 'product', variantId = null) =>
        set((state) => ({
          items: state.items.filter(
            (item) =>
              !(
                String(item.product.id) === String(productId) &&
                (item.type || 'product') === type &&
                String(item.variant?.id ?? '') === String(variantId ?? '')
              )
          ),
        })),

      updateQty: (productId, quantity, type = 'product', variantId = null) => {
        if (quantity <= 0) {
          get().removeItem(productId, type, variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) => {
            if (
              String(item.product.id) === String(productId) &&
              (item.type || 'product') === type &&
              String(item.variant?.id ?? '') === String(variantId ?? '')
            ) {
              return { ...item, quantity };
            }
            return item;
          }),
        }));
      },

      /** Total qty across all variants of a product (for card badges). */
      getProductQuantity: (productId) =>
        get()
          .items.filter(
            (item) =>
              String(item.product.id) === String(productId) &&
              (item.type || 'product') !== 'combo'
          )
          .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),

      getComboQuantity: (comboId) =>
        get().items.find(
          (item) => item.product.id === comboId && item.type === 'combo'
        )?.quantity || 0,

      clearCart: () =>
        set({
          items: [],
          appliedCouponCode: null,
          appliedCouponId: null,
          appliedCoupon: null,
          freeDeliveryProgress: null,
          // Keep couponAutoApplyDisabled false after clear so next cart can auto-apply.
          couponAutoApplyDisabled: false,
        }),
    }),
    {
      name: 'serveloco-customer-cart',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (state) => ({ items: state.items }),
      migrate: (persisted) => {
        // Ensure every line has a variant field after upgrade.
        if (!persisted || !Array.isArray(persisted.items)) return persisted;
        return {
          ...persisted,
          items: persisted.items.map((item) => ({
            ...item,
            variant: item.variant ?? null,
          })),
        };
      },
    }
  )
);

export const selectCartTotalItems = (state) =>
  state.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

export const selectCartDisplayTotal = (state) =>
  state.items.reduce((sum, item) => {
    const price = Number(item?.variant?.price ?? item?.product?.price) || 0;
    const qty = Number(item?.quantity) || 0;
    return sum + price * qty;
  }, 0);

export function lineUnitPrice(item) {
  return Number(item?.variant?.price ?? item?.product?.price) || 0;
}
