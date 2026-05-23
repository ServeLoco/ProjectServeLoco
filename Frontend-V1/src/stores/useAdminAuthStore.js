import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useAdminAuthStore
 * Admin authentication and session store.
 */
export const useAdminAuthStore = create(
  persist(
    (set) => ({
      adminToken: null,
      adminUser: null,
      isAdminAuthenticated: false,
      isAdminMode: false,
      
      setAdminMode: (mode) => set({ isAdminMode: mode }),
      
      setAdminSession: (adminToken, adminUser) => 
        set({ adminToken, adminUser, isAdminAuthenticated: true }),
        
      adminLogout: () => 
        set({ adminToken: null, adminUser: null, isAdminAuthenticated: false }),
    }),
    {
      name: 'serveloco-admin-auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAdminAuthStore;
