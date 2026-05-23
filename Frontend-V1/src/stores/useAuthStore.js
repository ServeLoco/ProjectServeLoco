import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useAuthStore
 * Customer authentication and session store.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      redirectRoute: null,
      
      setRedirectRoute: (route) => set({ redirectRoute: route }),
      
      setSession: (token, user) => 
        set({ token, user, isAuthenticated: true }),
        
      logout: () => 
        set({ token: null, user: null, isAuthenticated: false }),
        
      updateUser: (userData) => 
        set((state) => ({ user: { ...state.user, ...userData } })),
    }),
    {
      name: 'serveloco-customer-auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAuthStore;
