import { apiClient } from './httpClient';
import { normalizeSession } from '../utils/apiMappers';

const authApi = {
  getMe: options => apiClient.get('/auth/me', { ...options, auth: 'customer' }).then(normalizeSession),
  login: payload => apiClient.post('/auth/login', payload).then(normalizeSession),
  signup: payload => apiClient.post('/auth/signup', payload).then(normalizeSession),
  updateProfile: payload => apiClient.patch('/auth/profile', payload, { auth: 'customer' }).then(normalizeSession),
};

export { authApi };
