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
  create: (data) => apiClient('/admin/categories', { method: 'POST', body: data }),
  update: (id, data) => apiClient(`/admin/categories/${id}`, { method: 'PUT', body: data }),
  delete: (id) => apiClient(`/admin/categories/${id}`, { method: 'DELETE' }),
};

export const OffersApi = {
  list: () => apiClient('/admin/offers', { method: 'GET' }),
  create: (data) => apiClient('/admin/offers', { method: 'POST', body: data }),
  update: (id, data) => apiClient(`/admin/offers/${id}`, { method: 'PATCH', body: data }),
  delete: (id) => apiClient(`/admin/offers/${id}`, { method: 'DELETE' }),
};

export const CustomersApi = {
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/customers?${qs}`, { method: 'GET' });
  },
  get: (id) => apiClient(`/admin/customers/${id}`, { method: 'GET' }),
  updateBlock: (id, is_blocked) => apiClient(`/admin/customers/${id}/block`, { method: 'PATCH', body: { is_blocked } }),
  updateTrust: (id, trusted) => apiClient(`/admin/customers/${id}/trust`, { method: 'PATCH', body: { trusted } }),
};

export const SettingsApi = {
  get: () => apiClient('/admin/settings', { method: 'GET' }),
  update: (data) => apiClient('/admin/settings', { method: 'PATCH', body: data }),
};

export const ImagesApi = {
  list: () => apiClient('/admin/images', { method: 'GET' }),
  upload: (formData) => apiClient('/admin/images', { method: 'POST', body: formData }),
  delete: (id) => apiClient(`/admin/images/${id}`, { method: 'DELETE' }),
};

export const ReportsApi = {
  getSales: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/reports/sales?${qs}`, { method: 'GET' });
  },
  getCustomers: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/reports/customers?${qs}`, { method: 'GET' });
  },
  getTopProducts: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/reports/top-products?${qs}`, { method: 'GET' });
  },
};

export const HealthApi = {
  check: () => apiClient('/health', { method: 'GET' }), // note this hits the public route without /admin prefix
};

export const AuditApi = {
  list: (params) => {
    const qs = new URLSearchParams(params).toString();
    return apiClient(`/admin/audit?${qs}`, { method: 'GET' });
  }
};
