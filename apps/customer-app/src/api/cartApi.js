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
  // "Add more" row: products that go with these cart items (learned nightly
  // from delivered orders). Always answers a list, empty when nothing fits.
  suggestions: ({ productIds = [], latitude, longitude, limit } = {}) => {
    const qs = new URLSearchParams();
    qs.set('productIds', productIds.join(','));
    if (latitude != null && longitude != null) {
      qs.set('latitude', latitude);
      qs.set('longitude', longitude);
    }
    if (limit) qs.set('limit', limit);
    return apiClient.get(`/cart/suggestions?${qs.toString()}`, { auth: 'customer' });
  },
};

export { cartApi };