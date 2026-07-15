import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCartStore } from './useCartStore';
import { authApi } from '../api/authApi';
import { adminApi } from '../api/adminApi';
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
      shop: null,
      rider: null,
      admin: null,
      adminToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      sessionChecked: false,
      // Bumped on every login/logout so in-flight /auth/me responses from a
      // previous account cannot overwrite the new session (token vs user
      // desync — e.g. JWT for 8888… with profile still showing 9999…).
      sessionGeneration: 0,
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
        const generation = state.sessionGeneration;

        const finish = (result) => {
          // Only mark sessionChecked if we still own this generation —
          // a newer login/logout already set its own flags.
          if (useAuthStore.getState().sessionGeneration === generation) {
            useAuthStore.setState({ sessionChecked: true });
          }
          return result;
        };

        if (!token) return finish(false);

        if (isJwtExpired(token)) {
          // Only log out if this is still the same session we started with.
          if (useAuthStore.getState().sessionGeneration === generation) {
            useAuthStore.getState().logout();
          }
          return finish(false);
        }

        try {
          // Hard timeout so a hanging /auth/me request (e.g. DNS stall,
          // unavailable AbortController, or slow cold-start network) never
          // leaves the user stuck on the boot spinner. On timeout we treat
          // it as a transient error and keep the cached session — the next
          // authenticated request will either succeed or get a real 401 and
          // log the user out cleanly.
          const fresh = await Promise.race([
            authApi.getMe(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject({ status: 0, code: 'TIMEOUT', message: 'Session validation timed out' }),
                5000
              )
            ),
          ]);

          // Stale response: user logged out/in while getMe was in flight.
          // Applying this would leave JWT for user A with profile for user B.
          if (useAuthStore.getState().sessionGeneration !== generation) {
            return false;
          }
          // Also bail if the token was swapped without a generation bump
          // (defensive — generation should cover login/logout).
          if (useAuthStore.getState().token !== token && !fresh.token) {
            return finish(true);
          }

          // fresh = { token, user } from normalizeSession.
          // Always replace user/profile wholesale — never merge with a
          // previous account's cached fields.
          const nextUser = fresh.user || null;
          const updates = {
            user: nextUser,
            profile: nextUser,
            shop: fresh.shop ?? null,
            rider: fresh.rider ?? null,
            admin: fresh.admin ?? null,
            isAuthenticated: true,
          };
          if (fresh.token) {
            updates.token = fresh.token;
          }
          useAuthStore.setState(updates);
          if (updates.admin) {
            // Fire-and-forget — the admin shell reacts once adminToken lands.
            useAuthStore.getState().mintAdminSession();
          } else {
            useAuthStore.getState().clearAdminSession();
          }
          return finish(true);
        } catch (err) {
          if (useAuthStore.getState().sessionGeneration !== generation) {
            return false;
          }
          const status = err && err.status;
          if (status === 401 || status === 403) {
            useAuthStore.getState().logout();
            return finish(false);
          }
          return finish(true);
        }
      },

      setSession: (token, user, shop = null, rider = null, admin = null) => {
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
        // Wholesale replace — never leave previous account fields hanging
        // (adminToken, old profile phone, etc.). Bump sessionGeneration so
        // any in-flight validateSession/getMe for the prior account is ignored.
        const nextGen = (useAuthStore.getState().sessionGeneration || 0) + 1;
        set({
          token,
          user: user || null,
          profile: user || null,
          shop: shop ?? null,
          rider: rider ?? null,
          admin: admin ?? null,
          adminToken: null,
          isAuthenticated: true,
          sessionChecked: true,
          sessionGeneration: nextGen,
        });
        if (admin) {
          // Fire-and-forget — mints the admin JWT so AdminNavigator can render.
          useAuthStore.getState().mintAdminSession();
        }
      },

      setRider: (rider) => set({ rider }),

      // Exchanges the current customer session for an admin JWT (this phone
      // is an active mobile admin). Returns the token, or null on failure —
      // never throws (mirrors the fire-and-forget callers above).
      //
      // Only a definitive rejection (401/403 — phone deactivated or customer
      // session dead) clears the admin role. A transient failure (offline,
      // 5xx, timeout) keeps `admin` set with `adminToken` null so the
      // AdminMintGate in RootNavigator can retry, instead of silently
      // demoting a real admin to the customer shell over a network blip.
      mintAdminSession: async () => {
        try {
          const { token } = await adminApi.mintSession();
          useAuthStore.setState({ adminToken: token || null });
          return token || null;
        } catch (err) {
          const status = err && err.status;
          if (status === 401 || status === 403) {
            useAuthStore.setState({ admin: null, adminToken: null });
          }
          return null;
        }
      },

      clearAdminSession: () => set({ admin: null, adminToken: null }),

      logout: () => {
        // Fire-and-forget: tell the server to null this user's push token so a
        // shared device doesn't keep receiving their notifications. Errors are
        // swallowed — we clear local state regardless so the user is logged out
        // even if the request fails (offline, expired token, etc.).
        try {
          const token = useAuthStore.getState()?.token;
          if (token) {
            authApi.logout().catch(() => {});
          }
        } catch (_) { /* never block logout on the server call */ }
        try {
          useCartStore.getState()?.clearCart?.();
        } catch (_) { /* ignore cart clear errors on logout */ }

        // Force push-token re-register on next login (new account on same device).
        // Do NOT touch Firebase Auth here — logout is JWT/Zustand only. OTP
        // wrong-account protection lives in AuthScreen (same-phone check).
        try {
          AsyncStorage.removeItem('serveloco:lastPushToken').catch(() => {});
        } catch (_) { /* ignore */ }

        const nextGen = (useAuthStore.getState().sessionGeneration || 0) + 1;
        set({
          token: null,
          user: null,
          profile: null,
          shop: null,
          rider: null,
          admin: null,
          adminToken: null,
          isAuthenticated: false,
          sessionChecked: true,
          sessionGeneration: nextGen,
          previewStartedAt: Date.now(),
        });
      },
        
      updateUser: (userData) => 
        set((state) => {
          // Never merge profile fields across different user ids.
          const sameUser =
            userData?.id == null
            || state.user?.id == null
            || String(state.user.id) === String(userData.id);
          if (!sameUser) {
            return {
              user: userData,
              profile: userData,
            };
          }
          return {
            user: { ...state.user, ...userData },
            profile: { ...state.profile, ...userData },
          };
        }),

      setProfile: (profile) =>
        set((state) => {
          if (!profile || typeof profile !== 'object') {
            return { profile: profile ?? null };
          }
          // Reject a profile that belongs to a different user id. A stale
          // /auth/me for the previous account after re-login used to clobber
          // the new session (JWT for user B, profile still showing user A).
          // Account switches only go through setSession / validateSession.
          if (
            profile.id != null
            && state.user?.id != null
            && String(state.user.id) !== String(profile.id)
          ) {
            return {};
          }
          return {
            profile,
            user: state.user ? { ...state.user, ...profile } : profile,
          };
        }),
    }),
    {
      name: 'serveloco-customer-auth',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Persisted shape changed across app versions without a bump before
      // this — bump this whenever a field is added/removed/renamed below
      // so old installs don't load a stale shape into new code.
      migrate: (persistedState) => {
        const state = persistedState || {};
        return {
          token: state.token ?? null,
          user: state.user ?? null,
          profile: state.profile ?? null,
          shop: state.shop ?? null,
          rider: state.rider ?? null,
          admin: state.admin ?? null,
          adminToken: state.adminToken ?? null,
          isAuthenticated: Boolean(state.token) && Boolean(state.isAuthenticated),
        };
      },
      // Only persist real session data. Volatile flags (hasHydrated,
      // sessionChecked) must stay false on cold start so the spinner
      // shows until the store actually rehydrates and validates.
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        profile: state.profile,
        shop: state.shop,
        rider: state.rider,
        admin: state.admin,
        adminToken: state.adminToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // If there's no token after rehydration, mark the session as
        // already checked — there's nothing to validate. Without this,
        // a fresh install would spin forever because validateSession
        // might never run (or run before subscribers are attached).
        if (!state?.token) {
          useAuthStore.setState({ sessionChecked: true });
        }
      },
    }
  )
);

export default useAuthStore;
