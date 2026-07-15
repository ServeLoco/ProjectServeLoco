import { apiClient } from './httpClient';
import { normalizeSession } from '../utils/apiMappers';

const authApi = {
  getMe: options => apiClient.get('/auth/me', { ...options, auth: 'customer' }).then(normalizeSession),
  updateProfile: payload => apiClient.patch('/auth/profile', payload, { auth: 'customer' }).then(normalizeSession),
  // Soft-delete with 30-day grace. Backend sets deletion_requested_at;
  // user can cancel anytime via cancelAccountDeletion. After 30 days a daily
  // sweep hard-deletes the row.
  requestAccountDeletion: payload => apiClient.post('/auth/me/request-deletion', payload, { auth: 'customer' }),
  cancelAccountDeletion: () => apiClient.post('/auth/me/cancel-deletion', {}, { auth: 'customer' }),
  registerPushToken: (push_token, fcm_token = null) =>
    apiClient.post(
      '/auth/me/push-token',
      { push_token, fcm_token: fcm_token || undefined },
      { auth: 'customer' },
    ),
  // Logout — nulls the server-side push token before the client clears state.
  logout: () => apiClient.post('/auth/logout', {}, { auth: 'customer' }),

  // Firebase Phone Auth — send the Firebase ID token to the backend for verification.
  // For login:  { idToken }
  // For signup: { idToken, name }
  firebaseVerify: payload => apiClient.post('/auth/firebase-verify', payload).then(normalizeSession),
};

export { authApi };
