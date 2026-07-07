import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set) => ({
      items: [], // [{ product: { id, name, price, unit, imageUrl }, quantity, type: 'product'|'combo' }]

      // Coupon state — survives navigation from cart to checkout.
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

      addItem: (product, quantity = 1) => set((state) => {
        const existing = state.items.find(i => i.product.id === product.id && i.type === 'product');
        if (existing) {
          return {
            items: state.items.map(i =>
              i.product.id === product.id && i.type === 'product'
                ? { ...i, quantity: i.quantity + quantity }
                : i
            )
          };
        }
        return { items: [...state.items, { product, quantity, type: 'product' }] };
      }),

      addCombo: (combo, quantity = 1) => set((state) => {
        const existing = state.items.find(i => i.product.id === combo.id && i.type === 'combo');
        if (existing) {
          return {
            items: state.items.map(i =>
              i.product.id === combo.id && i.type === 'combo'
                ? { ...i, quantity: i.quantity + quantity }
                : i
            )
          };
        }
        return { items: [...state.items, { product: combo, quantity, type: 'combo' }] };
      }),

      removeItem: (productId, type = 'product') => set((state) => ({
        items: state.items.filter(i => !(i.product.id === productId && i.type === type))
      })),

      updateQty: (productId, quantity, type = 'product') => set((state) => {
        if (quantity <= 0) {
          return { items: state.items.filter(i => !(i.product.id === productId && i.type === type)) };
        }
        return {
          items: state.items.map(i =>
            i.product.id === productId && i.type === type
              ? { ...i, quantity }
              : i
          )
        };
      }),

      clearCart: () => set({
        items: [],
        appliedCouponCode: null,
        appliedCouponId: null,
        appliedCoupon: null,
        freeDeliveryProgress: null
      }),
    }),
    {
      name: 'serveloco-customer-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
);

export const selectCartTotalItems = (state) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);

export const selectCartDisplayTotal = (state) =>
  state.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
