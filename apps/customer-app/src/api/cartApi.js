import { apiClient } from './httpClient';

const cartApi = {
  calculate: payload => apiClient.post('/cart/calculate', payload, { auth: 'customer' }),
  validateCoupon: payload => apiClient.post('/cart/validate-coupon', payload, { auth: 'customer' }),
  getAvailableCoupons: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        qs.set(key, value);
      }
    });
    const query = qs.toString();
    return apiClient.get(`/cart/available-coupons${query ? `?${query}` : ''}`, { auth: 'customer' });
  },
};

export { cartApi };