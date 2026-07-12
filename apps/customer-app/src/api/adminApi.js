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

  // ADMIN TASK 10 — Riders
  listRiders: () => apiClient.get('/admin/riders', { auth: 'admin' }),
  createRider: (data) => apiClient.post('/admin/riders', data, { auth: 'admin' }),
  updateRider: (id, data) => apiClient.patch(`/admin/riders/${id}`, data, { auth: 'admin' }),

  // ADMIN TASK 11 — Shops
  listShops: () => apiClient.get('/admin/shops', { auth: 'admin' }),
  createShop: (data) => apiClient.post('/admin/shops', data, { auth: 'admin' }),
  updateShop: (id, data) => apiClient.patch(`/admin/shops/${id}`, data, { auth: 'admin' }),

  // ADMIN TASK 12 — Customers
  listCustomers: (params) => apiClient.get(`/admin/customers${buildQueryString(params)}`, { auth: 'admin' }),
  getCustomer: (id) => apiClient.get(`/admin/customers/${id}`, { auth: 'admin' }),
  updateCustomerBlock: (id, blocked) => apiClient.patch(`/admin/customers/${id}/block`, { blocked }, { auth: 'admin' }),
  updateCustomerTrust: (id, trusted) => apiClient.patch(`/admin/customers/${id}/trust`, { trusted }, { auth: 'admin' }),

  // ADMIN TASK 13 — Notifications (broadcast + templates)
  listNotifications: (params) => apiClient.get(`/admin/notifications${buildQueryString(params)}`, { auth: 'admin' }),
  createNotification: (data) => apiClient.post('/admin/notifications', data, { auth: 'admin' }),
  deleteNotification: (id) => apiClient.delete(`/admin/notifications/${id}`, { auth: 'admin' }),
  listNotificationTemplates: () => apiClient.get('/admin/notification-templates', { auth: 'admin' }),
  updateNotificationTemplate: (id, data) => apiClient.patch(`/admin/notification-templates/${id}`, data, { auth: 'admin' }),
  resetNotificationTemplate: (id) => apiClient.post(`/admin/notification-templates/${id}/reset`, {}, { auth: 'admin' }),
};

export { adminApi };
