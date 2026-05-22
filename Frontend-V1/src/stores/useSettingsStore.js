import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useSettingsStore
 * App global settings (shop status, delivery charges, etc.)
 */
export const useSettingsStore = create(
  persist(
    (set) => ({
      shopStatus: 'open', // 'open' | 'closed'
      minimumOrder: 0,
      deliveryCharge: 0,
      nightCharge: 0,
      activeOffer: null, // { title, description, code }
      
      setSettings: (settings) => 
        set((state) => ({ ...state, ...settings })),
        
    }),
    {
      name: 'serveloco-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useSettingsStore;
