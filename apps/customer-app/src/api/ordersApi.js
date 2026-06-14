import { apiClient } from './httpClient';

const ordersApi = {
  cancelOrder: id => apiClient.post(`/orders/${id}/cancel`, null, { auth: 'customer' }),
  createOrder: payload => apiClient.post('/orders', payload, { auth: 'customer' }),
  getOrder: id => apiClient.get(`/orders/${id}`, { auth: 'customer' }),
  getOrders: () => apiClient.get('/orders', { auth: 'customer' }),
};

export { ordersApi };
