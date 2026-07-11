import { apiClient } from './httpClient';

// Thin client over /api/rider/* — same customer JWT; rider capability is DB-derived.
const riderApi = {
  getMe: () => apiClient.get('/rider/me', { auth: 'customer' }),
  setOnline: (isOnline) =>
    apiClient.patch('/rider/me/online', { isOnline, is_online: isOnline }, { auth: 'customer' }),
  heartbeat: () => apiClient.post('/rider/me/heartbeat', {}, { auth: 'customer' }),
  getActiveOffer: () => apiClient.get('/rider/offers/active', { auth: 'customer' }),
  acceptOffer: (offerId) =>
    apiClient.post(`/rider/offers/${offerId}/accept`, {}, { auth: 'customer' }),
  rejectOffer: (offerId) =>
    apiClient.post(`/rider/offers/${offerId}/reject`, {}, { auth: 'customer' }),
  getCurrentAssignment: () => apiClient.get('/rider/assignments/current', { auth: 'customer' }),
  getHistory: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiClient.get(`/rider/assignments/history${q ? `?${q}` : ''}`, { auth: 'customer' });
  },
  cancelAssignment: (orderId) =>
    apiClient.post(`/rider/assignments/${orderId}/cancel`, {}, { auth: 'customer' }),
  markPickedUp: (orderId) =>
    apiClient.post(`/rider/assignments/${orderId}/picked-up`, {}, { auth: 'customer' }),
  updateStatus: (orderId, status) =>
    apiClient.patch(`/rider/assignments/${orderId}/status`, { status }, { auth: 'customer' }),
};

export { riderApi };
