import { create } from 'zustand';
import { settingsApi } from '../api/settingsApi';

function deriveShopState(payload) {
  // Accept both camelCase and snake_case from API
  const openFlag = payload?.shopOpen ?? payload?.shop_open;
  const shopOpen = openFlag !== false && openFlag !== 0;
  return {
    shopOpen,
    shopStatus: shopOpen ? 'open' : 'closed',
  };
}

export const useSettingsStore = create((set, get) => ({
  settings: null,
  shopOpen: true,
  shopStatus: 'open',
  isLoading: false,
  error: null,
  lastFetched: null,

  setSettings: (payload) => {
    if (!payload) return;
    const shop = deriveShopState(payload);
    set({
      settings: payload,
      ...shop,
      lastFetched: Date.now(),
    });
  },

  fetchSettings: async (force = false) => {
    const now = Date.now();
    const { lastFetched } = get();
    // 5 min TTL
    if (!force && lastFetched && now - lastFetched < 5 * 60 * 1000) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const res = await settingsApi.getSettings();
      const payload = res.data || res;
      const shop = deriveShopState(payload);
      set({
        settings: payload,
        ...shop,
        lastFetched: now,
        isLoading: false,
      });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  },
}));
