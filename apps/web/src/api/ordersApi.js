import { apiClient } from './client';

export const ordersApi = {
  createOrder: (payload) => apiClient.post('/orders', payload),
  getOrders: () => apiClient.get('/orders'),
  getOrder: (id) => apiClient.get(`/orders/${id}`),
  cancelOrder: (id) => apiClient.post(`/orders/${id}/cancel`),
};
