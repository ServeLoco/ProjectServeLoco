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
        _lastFetched: null,
      }),
    }
  )
);

export default useSettingsStore;
