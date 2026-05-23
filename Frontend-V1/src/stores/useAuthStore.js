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
      profile: null,
      isAuthenticated: false,
      redirectRoute: null,
      previewStartedAt: Date.now(),
      
      setRedirectRoute: (route) => set({ redirectRoute: route }),
      
      setSession: (token, user) => 
        set({ token, user, profile: user, isAuthenticated: true }),
        
      logout: () => 
        set({
          token: null,
          user: null,
          profile: null,
          isAuthenticated: false,
          previewStartedAt: Date.now(),
        }),
        
      updateUser: (userData) => 
        set((state) => ({
          user: { ...state.user, ...userData },
          profile: { ...state.profile, ...userData },
        })),

      setProfile: (profile) =>
        set((state) => ({
          profile,
          user: { ...state.user, ...profile },
        })),
    }),
    {
      name: 'serveloco-customer-auth',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAuthStore;
