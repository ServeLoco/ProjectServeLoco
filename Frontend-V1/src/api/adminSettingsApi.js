import { apiClient } from './httpClient';

const adminSettingsApi = {
  createOffer: payload => apiClient.post('/admin/offers', payload, { auth: 'admin' }),
  getActiveOffer: () => apiClient.get('/admin/offers/active', { auth: 'admin' }),
  getSettings: () => apiClient.get('/admin/settings', { auth: 'admin' }),
  updateOffer: (id, payload) => apiClient.patch(
    `/admin/offers/${id}`,
    payload,
    { auth: 'admin' },
  ),
  updateSettings: payload => apiClient.patch('/admin/settings', payload, { auth: 'admin' }),
};

export { adminSettingsApi };
