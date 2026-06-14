import { create } from 'zustand';
import { settingsApi } from '../api/settingsApi';

export const useSettingsStore = create((set, get) => ({
  settings: null,
  shopOpen: true,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchSettings: async (force = false) => {
    const now = Date.now();
    const { lastFetched } = get();
    // 5 min TTL
    if (!force && lastFetched && (now - lastFetched < 5 * 60 * 1000)) {
      return;
    }
    
    set({ isLoading: true, error: null });
    try {
      const res = await settingsApi.getSettings();
      const payload = res.data || res;
      set({ 
        settings: payload,
        shopOpen: payload.shopOpen !== false, // default true if undefined
        lastFetched: now,
        isLoading: false 
      });
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  }
}));
