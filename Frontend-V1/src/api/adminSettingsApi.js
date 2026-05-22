import { apiClient } from './httpClient';

const adminSettingsApi = {
  createOffer: payload => apiClient.post('/admin/offers', payload, { auth: 'admin' }),
  updateOffer: (id, payload) => apiClient.patch(
    `/admin/offers/${id}`,
    payload,
    { auth: 'admin' },
  ),
  updateSettings: payload => apiClient.patch('/admin/settings', payload, { auth: 'admin' }),
};

export { adminSettingsApi };
