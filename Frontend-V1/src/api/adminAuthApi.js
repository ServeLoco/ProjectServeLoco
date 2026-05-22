import { apiClient } from './httpClient';

const adminAuthApi = {
  getMe: options => apiClient.get('/admin/me', { ...options, auth: 'admin' }),
  login: payload => apiClient.post('/admin/login', payload),
};

export { adminAuthApi };
