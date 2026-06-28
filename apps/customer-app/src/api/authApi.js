import { apiClient } from './httpClient';
import { normalizeSession } from '../utils/apiMappers';

const authApi = {
  getMe: options => apiClient.get('/auth/me', { ...options, auth: 'customer' }).then(normalizeSession),
  login: payload => apiClient.post('/auth/login', payload).then(normalizeSession),
  signup: payload => apiClient.post('/auth/signup', payload).then(normalizeSession),
  requestPasswordReset: payload => apiClient.post('/auth/password-reset-requests', payload),
  updateProfile: payload => apiClient.patch('/auth/profile', payload, { auth: 'customer' }).then(normalizeSession),
  // Soft-delete with 30-day grace. Backend sets deletion_requested_at;
  // user can cancel anytime via cancelAccountDeletion. After 30 days a daily
  // sweep hard-deletes the row.
  requestAccountDeletion: payload => apiClient.post('/auth/me/request-deletion', payload, { auth: 'customer' }),
  cancelAccountDeletion: () => apiClient.post('/auth/me/cancel-deletion', {}, { auth: 'customer' }),
  registerPushToken: (push_token) => apiClient.post('/auth/me/push-token', { push_token }, { auth: 'customer' }),

  // Firebase Phone Auth — send the Firebase ID token to the backend for verification.
  // For login:  { idToken }
  // For signup: { idToken, name }
  firebaseVerify: payload => apiClient.post('/auth/firebase-verify', payload).then(normalizeSession),
};

export { authApi };
