import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCartStore } from './useCartStore';
import { authApi } from '../api/authApi';
import { isJwtExpired } from '../utils/jwt';

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
      hasHydrated: false,
      sessionChecked: false,
      redirectRoute: null,
      previewStartedAt: Date.now(),

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      setRedirectRoute: (route) => set({ redirectRoute: route }),

      // validateSession - runs at app start (and any time we want to confirm
      // a token is still good). Returns true if the session is valid, false
      // if we ended up logging out.
      //   1. If no token at all -> false (caller treats as logged out).
      //   2. If the token's JWT exp is in the past -> clear and return false
      //      (avoids the round-trip; token is provably dead locally).
      //   3. Otherwise call /auth/me to confirm the server still accepts it
      //      (handles the case where the server invalidated the token out of
      //      band, e.g. user deleted, JWT secret rotated).
      //   4. If /auth/me returns 401/403 -> clear and return false.
      //   5. Otherwise refresh the user object and return true.
      //   6. Transient errors (network, 5xx) -> keep the session; the token
      //      is not necessarily dead and we don't want to log the user out
      //      just because their wifi blipped.
      validateSession: async () => {
        const state = useAuthStore.getState();
        const token = state.token;

        const finish = (result) => {
          useAuthStore.setState({ sessionChecked: true });
          return result;
        };

        if (!token) return finish(false);

        if (isJwtExpired(token)) {
          state.logout();
          return finish(false);
        }

        try {
          const fresh = await authApi.getMe();
          useAuthStore.setState({ user: fresh, profile: fresh, isAuthenticated: true });
          return finish(true);
        } catch (err) {
          const status = err && err.status;
          if (status === 401 || status === 403) {
            state.logout();
            return finish(false);
          }
          return finish(true);
        }
      },

      setSession: (token, user) => {
        // Clear any previous user's cart when a new session starts.
        // Prevents cart bleed across user accounts on the same device.
        try {
          const cartState = useCartStore.getState();
          const prevUserId = useAuthStore.getState()?.user?.id;
          const newUserId = user?.id;
          if (prevUserId && newUserId && String(prevUserId) !== String(newUserId)) {
            cartState.clearCart?.();
          }
        } catch (_) {
          // Best-effort; never block sign-in on this.
        }
        set({ token, user, profile: user, isAuthenticated: true });
      },

      logout: () => {
        try {
          useCartStore.getState()?.clearCart?.();
        } catch (_) { /* ignore cart clear errors on logout */ }
        set({
          token: null,
          user: null,
          profile: null,
          isAuthenticated: false,
          previewStartedAt: Date.now(),
        });
      },
        
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
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export default useAuthStore;
