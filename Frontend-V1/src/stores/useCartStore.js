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
          updatedItems[existingItemIndex].quantity += quantity;
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
          updatedItems[existingItemIndex].quantity += quantity;
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
        return get().items.reduce((total, item) => total + (item.product.price * item.quantity), 0);
      }
    }),
    {
      name: 'serveloco-cart',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCartStore;
