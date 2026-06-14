import { apiClient } from './client';

export const authApi = {
  login: (payload) => apiClient.post('/auth/login', payload),
  signup: (payload) => apiClient.post('/auth/signup', payload),
  getMe: () => apiClient.get('/auth/me'),
  updateProfile: (payload) => apiClient.patch('/auth/profile', payload),
  requestPasswordReset: (payload) => apiClient.post('/auth/password-reset-requests', payload),
};
