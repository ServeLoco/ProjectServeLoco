import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_TTL = 5 * 60 * 1000; // 5 minutes

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      shopStatus: 'open',
      deliveryAvailable: true,
      minimumOrder: 0,
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
    }
  )
);

export default useSettingsStore;
