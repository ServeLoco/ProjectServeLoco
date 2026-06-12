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
        set({ user: null, token: null });
      },
    }),
    {
      name: 'serveloco-customer-auth', // same key used in storage.js
      storage: createJSONStorage(() => localStorage),
    }
  )
);
