import { apiClient } from './client';

export const couponsApi = {
  getAvailable: (params) => apiClient.get('/available-coupons', { params }),
  validate: (payload) => apiClient.post('/validate-coupon', payload),
};