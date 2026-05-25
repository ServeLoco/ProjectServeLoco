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
      items: [], // Array of { product, quantity }
      
      addItem: (product, quantity = 1) => {
        const { items } = get();
        const existingItemIndex = items.findIndex((item) => item.product.id === product.id);
        
        if (existingItemIndex >= 0) {
          const updatedItems = [...items];
          updatedItems[existingItemIndex].quantity += quantity;
          set({ items: updatedItems });
        } else {
          set({ items: [...items, { product, quantity }] });
        }
      },

      addCombo: (combo, quantity = 1) => {
        const comboItems = combo?.comboItems || combo?.combo_items || [];

        if (!Array.isArray(comboItems) || comboItems.length === 0) {
          get().addItem(combo, quantity);
          return;
        }

        comboItems.forEach((item) => {
          const itemQuantity = Math.max(1, Number(item.quantity || item.qty || 1));
          get().addItem(item, itemQuantity * quantity);
        });
      },

      decrementCombo: (combo) => {
        const comboItems = combo?.comboItems || combo?.combo_items || [];

        if (!Array.isArray(comboItems) || comboItems.length === 0) {
          const current = get().items.find(item => item.product.id === combo.id)?.quantity || 0;
          get().updateQuantity(combo.id, current - 1);
          return;
        }

        comboItems.forEach((item) => {
          const itemQuantity = Math.max(1, Number(item.quantity || item.qty || 1));
          const current = get().items.find(cartItem => cartItem.product.id === item.id)?.quantity || 0;
          get().updateQuantity(item.id, current - itemQuantity);
        });
      },

      getComboQuantity: (combo) => {
        const comboItems = combo?.comboItems || combo?.combo_items || [];

        if (!Array.isArray(comboItems) || comboItems.length === 0) {
          return get().items.find(item => item.product.id === combo?.id)?.quantity || 0;
        }

        const counts = comboItems.map((item) => {
          const itemQuantity = Math.max(1, Number(item.quantity || item.qty || 1));
          const current = get().items.find(cartItem => cartItem.product.id === item.id)?.quantity || 0;
          return Math.floor(current / itemQuantity);
        });

        return counts.length ? Math.min(...counts) : 0;
      },
      
      removeItem: (productId) => {
        const { items } = get();
        set({ items: items.filter((item) => item.product.id !== productId) });
      },
      
      updateQuantity: (productId, quantity) => {
        const { items } = get();
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        
        const updatedItems = items.map((item) => {
          if (item.product.id === productId) {
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
