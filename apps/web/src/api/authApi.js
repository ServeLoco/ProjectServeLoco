import { apiClient } from './client';

export const authApi = {
  login: (payload) => apiClient.post('/auth/login', payload),
  signup: (payload) => apiClient.post('/auth/signup', payload),
  getMe: () => apiClient.get('/auth/me'),
  updateProfile: (payload) => apiClient.patch('/auth/profile', payload),
  requestPasswordReset: (payload) => apiClient.post('/auth/password-reset-requests', payload),

  // Firebase Phone Auth — send the Firebase ID token to the backend for verification.
  // For login:  { idToken }
  // For signup: { idToken, name }
  firebaseVerify: (payload) => apiClient.post('/auth/firebase-verify', payload),

  // Account soft-delete flow — 30-day grace period before permanent deletion.
  requestAccountDeletion: (payload = {}) => apiClient.post('/auth/me/request-deletion', payload),
  cancelAccountDeletion: () => apiClient.post('/auth/me/cancel-deletion'),
};
