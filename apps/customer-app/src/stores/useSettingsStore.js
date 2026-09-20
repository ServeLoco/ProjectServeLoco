import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_TTL = 5 * 60 * 1000; // 5 minutes

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      shopStatus: 'open',
      deliveryAvailable: true,
      upiId: null,
      upiQrImageId: null,
      upiQrImageUrl: null,
      activeOffer: null,
      nightCharge: 0,
      nightChargeStart: null,
      nightChargeEnd: null,
      rainChargeEnabled: false,
      navPromoImageUrl: null,
      navPromoLink: null,
      _lastFetched: null,

      setSettings: (settings) =>
        set((state) => ({ ...state, ...settings })),

      // Returns true if settings are stale and should be re-fetched
      isStale: () => {
        const last = get()._lastFetched;
        return !last || Date.now() - last > SETTINGS_TTL;
      },

      markFetched: () =>
        set({ _lastFetched: Date.now() }),
    }),
    {
      name: 'serveloco-settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // _lastFetched is a per-session freshness stamp and must NOT persist.
      // These values are per-area (UPI target, support contact, night charge
      // — §27.5), so a launch in area 2 hydrates area 1's and, with a stamp
      // under the 5-minute TTL, isStale() reports fresh and suppresses the
      // refetch that would correct them. Dropping the stamp makes every cold
      // start re-resolve settings against the pin that actually wins.
      partialize: ({ _lastFetched, ...rest }) => rest,
      // Force a re-fetch from the server on any shape change instead of
      // trusting stale persisted fields — this store is a cache, not a
      // source of truth, so dropping it on migrate is always safe.
      migrate: () => ({
        shopStatus: 'open',
        deliveryAvailable: true,
        upiId: null,
        upiQrImageId: null,
        upiQrImageUrl: null,
        activeOffer: null,
        nightCharge: 0,
        nightChargeStart: null,
        nightChargeEnd: null,
        rainChargeEnabled: false,
        navPromoImageUrl: null,
        navPromoLink: null,
        _lastFetched: null,
      }),
    }
  )
);

export default useSettingsStore;
