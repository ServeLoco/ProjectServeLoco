import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { connectCustomerRealtime, disconnectCustomerRealtime } from '../api/realtimeClient';
import { authApi } from '../api/authApi';

export const useAuthStore = create(
  persist(
    (set, get) => ({
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

      // Refresh the current user's profile from the backend and update the
      // store. Useful after the soft-delete flow so banners reflect the
      // new `deletionRequestedAt` / `isBlocked` flags immediately.
      fetchUser: async () => {
        const response = await authApi.getMe();
        const serverUser = response?.data?.user || response?.user || response?.data || response;
        if (serverUser) {
          set({ user: { ...(get().user || {}), ...serverUser } });
        }
        return serverUser;
      },

      // Soft-delete flow — schedule account deletion (30-day grace period).
      // Returns the API response on success, throws on failure.
      requestAccountDeletion: async (payload = {}) => {
        const response = await authApi.requestAccountDeletion(payload);
        try {
          await get().fetchUser();
        } catch {
          /* fetchUser failure is non-fatal; banner can refresh on next mount */
        }
        return response;
      },

      // Soft-delete flow — cancel a previously scheduled deletion.
      cancelAccountDeletion: async () => {
        const response = await authApi.cancelAccountDeletion();
        try {
          await get().fetchUser();
        } catch {
          /* fetchUser failure is non-fatal; banner can refresh on next mount */
        }
        return response;
      },
    }),
    {
      name: 'serveloco-customer-auth', // same key used in storage.js
      storage: createJSONStorage(() => localStorage),
    }
  )
);
