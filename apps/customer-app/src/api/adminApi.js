import { apiClient } from './httpClient';

const adminApi = {
  // Exchanges the current customer session for an admin JWT. Only succeeds
  // if this phone is an active mobile admin (backend: POST /admin/mobile-session).
  mintSession: () => apiClient.post('/admin/mobile-session', {}, { auth: 'customer' }),

  // ADMIN TASK 8 — Dashboard
  getDashboard: () => apiClient.get('/admin/dashboard', { auth: 'admin' }),
  // Dashboard only ever sends delivery_available — the full settings form
  // (charges, UPI, app versions…) stays web-only per plan §0 out-of-scope.
  updateSettings: (payload) => apiClient.patch('/admin/settings', payload, { auth: 'admin' }),
};

export { adminApi };
