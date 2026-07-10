import { apiClient } from './client';

export const storeModesApi = {
  list: () => apiClient.get('/store-modes'),
};
