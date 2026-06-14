import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { connectCustomerRealtime, disconnectCustomerRealtime } from '../api/realtimeClient';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (userData, token) => {
        if (token) {
          connectCustomerRealtime(token);
        }
        set({ user: userData, token });
      },
      updateUser: (updates) => set((state) => ({ user: { ...state.user, ...updates } })),
      logout: () => {
        disconnectCustomerRealtime();
        // Clear any cross-user UI state stored outside the auth slice
        // (e.g. the "install as PWA" prompt dismissal, which is per-user).
        try { localStorage.removeItem('ath-dismissed'); } catch { /* storage may be unavailable */ }
        set({ user: null, token: null });
      },
    }),
    {
      name: 'serveloco-customer-auth', // same key used in storage.js
      storage: createJSONStorage(() => localStorage),
    }
  )
);
