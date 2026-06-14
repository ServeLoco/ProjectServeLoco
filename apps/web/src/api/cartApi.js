import { apiClient } from './client';

export const cartApi = {
  calculate: (payload) => apiClient.post('/cart/calculate', payload),
};
