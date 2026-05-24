import { apiClient } from './client';

export const AuthApi = {
  login: (credentials) => apiClient('/admin/login', { method: 'POST', body: credentials }),
  me: () => apiClient('/admin/me', { method: 'GET' }),
};

export const DashboardApi = {
  getMetrics: () => apiClient('/admin/dashboard', { method: 'GET' }),
};

export const OrdersApi = {
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/orders?${qs}`, { method: 'GET' });
  },
  get: (id) => apiClient(`/admin/orders/${id}`, { method: 'GET' }),
  updateStatus: (id, status) => apiClient(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status } }),
  updatePayment: (id, payment) => apiClient(`/admin/orders/${id}/payment`, { method: 'PATCH', body: { payment } }),
};

export const ProductsApi = {
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/products?${qs}`, { method: 'GET' });
  },
  create: (data) => apiClient('/admin/products', { method: 'POST', body: data }),
  update: (id, data) => apiClient(`/admin/products/${id}`, { method: 'PUT', body: data }),
  delete: (id) => apiClient(`/admin/products/${id}`, { method: 'DELETE' }),
};

export const CategoriesApi = {
  list: () => apiClient('/admin/categories', { method: 'GET' }),
};

export const OffersApi = {
  list: () => apiClient('/admin/offers', { method: 'GET' }),
};

export const CustomersApi = {
  list: () => apiClient('/admin/customers', { method: 'GET' }),
};

export const SettingsApi = {
  get: () => apiClient('/admin/settings', { method: 'GET' }),
  update: (data) => apiClient('/admin/settings', { method: 'PATCH', body: data }),
};

export const ImagesApi = {
  list: () => apiClient('/admin/images', { method: 'GET' }),
  upload: (formData) => apiClient('/admin/images', { method: 'POST', body: formData }),
};

export const ReportsApi = {
  getSales: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/reports/sales?${qs}`, { method: 'GET' });
  },
};

export const HealthApi = {
  check: () => apiClient('/health', { method: 'GET' }),
};

export const AuditApi = {
  list: () => apiClient('/admin/audit', { method: 'GET' }),
};
