import { apiClient } from './httpClient';

const ordersApi = {
  cancelOrder: id => apiClient.post(`/orders/${id}/cancel`, null, { auth: 'customer' }),
  createOrder: (payload, options = {}) =>
    apiClient.post('/orders', payload, { auth: 'customer', ...options }),
  getOrder: id => apiClient.get(`/orders/${id}`, { auth: 'customer' }),
  // editSession: the current Orders-page visit; only that visit may change
  // a rating it saved (the server locks it after).
  rateItem: (orderId, orderItemId, stars, editSession) => apiClient.patch(
    `/orders/${orderId}/items/${orderItemId}/rating`,
    { stars, editSession },
    { auth: 'customer' },
  ),
  getOrders: (params = {}) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.offset !== undefined) query.set('offset', String(params.offset));
    if (params.date) query.set('date', params.date);
    const qs = query.toString();
    return apiClient.get(`/orders${qs ? `?${qs}` : ''}`, { auth: 'customer' });
  },
};

export { ordersApi };
