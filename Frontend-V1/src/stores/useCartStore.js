import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useCartStore
 * Local cart state. Prices here are display-only until verified by backend.
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [], // Array of { product, quantity, type: 'product' | 'combo' }
      
      addItem: (product, quantity = 1) => {
        const { items } = get();
        const existingItemIndex = items.findIndex((item) => item.product.id === product.id && item.type !== 'combo');

        if (existingItemIndex >= 0) {
          const updatedItems = [...items];
          updatedItems[existingItemIndex] = {
            ...updatedItems[existingItemIndex],
            quantity: updatedItems[existingItemIndex].quantity + quantity,
          };
          set({ items: updatedItems });
        } else {
          set({ items: [...items, { product, quantity, type: 'product' }] });
        }
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
      
      removeItem: (productId, type = 'product') => {
        const { items } = get();
        set({ items: items.filter((item) => !(item.product.id === productId && (item.type || 'product') === type)) });
      },
      
      updateQuantity: (productId, quantity, type = 'product') => {
        const { items } = get();
        if (quantity <= 0) {
          get().removeItem(productId, type);
          return;
        }
        
        const updatedItems = items.map((item) => {
          if (item.product.id === productId && (item.type || 'product') === type) {
            return { ...item, quantity };
          }
          return item;
        });
        
        set({ items: updatedItems });
      },
      
      clearCart: () => set({ items: [] }),
      
      // Selectors (computed properties)
      get totalItems() {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
      
      get displayTotal() {
        return get().items.reduce((total, item) => {
          const price = Number(item?.product?.price) || 0;
          const qty = Number(item?.quantity) || 0;
          return total + price * qty;
        }, 0);
      }
    }),
    {
      name: 'serveloco-cart',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
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
