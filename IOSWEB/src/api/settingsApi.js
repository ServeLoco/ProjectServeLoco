import { apiClient } from './client';

export const settingsApi = {
  getSettings: () => apiClient.get('/settings'),
};

export const offersApi = {
  getActiveOffer: () => apiClient.get('/offers/active'),
};
