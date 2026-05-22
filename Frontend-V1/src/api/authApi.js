import { apiClient } from './httpClient';

const authApi = {
  getMe: options => apiClient.get('/auth/me', { ...options, auth: 'customer' }),
  login: payload => apiClient.post('/auth/login', payload),
  signup: payload => apiClient.post('/auth/signup', payload),
  updateProfile: payload => apiClient.patch('/auth/profile', payload, { auth: 'customer' }),
};

export { authApi };
