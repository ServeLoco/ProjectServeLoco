import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const adminApi = {
  // Exchanges the current customer session for an admin JWT. Only succeeds
  // if this phone is an active mobile admin (backend: POST /admin/mobile-session).
  mintSession: () => apiClient.post('/admin/mobile-session', {}, { auth: 'customer' }),

  // ADMIN TASK 8 — Dashboard
  getDashboard: () => apiClient.get('/admin/dashboard', { auth: 'admin' }),
  // Dashboard only ever sends delivery_available — the full settings form
  // (charges, UPI, app versions…) stays web-only per plan §0 out-of-scope.
  updateSettings: (payload) => apiClient.patch('/admin/settings', payload, { auth: 'admin' }),

  // ADMIN TASK 9 — Orders (same filters/mutations as apps/admin Orders.jsx)
  listOrders: (params) => apiClient.get(`/admin/orders${buildQueryString(params)}`, { auth: 'admin' }),
  getOrder: (id) => apiClient.get(`/admin/orders/${id}`, { auth: 'admin' }),
  updateOrderStatus: (id, status, cancelReason) => apiClient.patch(
    `/admin/orders/${id}/status`,
    cancelReason ? { status, cancel_reason: cancelReason } : { status },
    { auth: 'admin' }
  ),
  updateOrderPayment: (id, paymentStatus) => apiClient.patch(
    `/admin/orders/${id}/payment`,
    { payment_status: paymentStatus, paymentStatus },
    { auth: 'admin' }
  ),
};

export { adminApi };
