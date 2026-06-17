import { apiClient } from './httpClient';
import { normalizeSession } from '../utils/apiMappers';

const authApi = {
  getMe: options => apiClient.get('/auth/me', { ...options, auth: 'customer' }).then(normalizeSession),
  login: payload => apiClient.post('/auth/login', payload).then(normalizeSession),
  signup: payload => apiClient.post('/auth/signup', payload).then(normalizeSession),
  requestPasswordReset: payload => apiClient.post('/auth/password-reset-requests', payload),
  updateProfile: payload => apiClient.patch('/auth/profile', payload, { auth: 'customer' }).then(normalizeSession),
  deleteAccount: () => apiClient.delete('/auth/me', { auth: 'customer' }),
};

export { authApi };
