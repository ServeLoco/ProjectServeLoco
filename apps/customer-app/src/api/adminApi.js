import { apiClient } from './httpClient';

const adminApi = {
  // Exchanges the current customer session for an admin JWT. Only succeeds
  // if this phone is an active mobile admin (backend: POST /admin/mobile-session).
  mintSession: () => apiClient.post('/admin/mobile-session', {}, { auth: 'customer' }),
};

export { adminApi };
