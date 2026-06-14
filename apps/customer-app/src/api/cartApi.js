import { apiClient } from './httpClient';

const cartApi = {
  calculate: payload => apiClient.post('/cart/calculate', payload, { auth: 'customer' }),
};

export { cartApi };
