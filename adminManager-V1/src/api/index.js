import { apiClient } from './client';

const withQuery = (path, params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, value);
    }
  });
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
};

export const AuthApi = {
  login: (credentials) => apiClient('/admin/login', { method: 'POST', body: credentials }),
  me: () => apiClient('/admin/me', { method: 'GET' }),
};

export const DashboardApi = {
  getMetrics: () => apiClient('/admin/dashboard', { method: 'GET' }),
};

export const OrdersApi = {
  list: (params) => apiClient(withQuery('/admin/orders', params), { method: 'GET' }),
  get: (id) => apiClient(`/admin/orders/${id}`, { method: 'GET' }),
  updateStatus: (id, status) => apiClient(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status } }),
  updatePayment: (id, paymentStatus) => apiClient(
    `/admin/orders/${id}/payment`,
    { method: 'PATCH', body: { paymentStatus, payment_status: paymentStatus } }
  ),
};

export const ProductsApi = {
  list: (params) => apiClient(withQuery('/admin/products', params), { method: 'GET' }),
  create: (data) => apiClient('/admin/products', { method: 'POST', body: data }),
  update: (id, data) => apiClient(`/admin/products/${id}`, { method: 'PUT', body: data }),
  delete: (id) => apiClient(`/admin/products/${id}`, { method: 'DELETE' }),
  updateAvailability: (id, available) => apiClient(
    `/admin/products/${id}/availability`,
    { method: 'PATCH', body: { available, isAvailable: available } }
  ),
  attachImage: (id, imageId) => apiClient(
    `/admin/products/${id}/image`,
    { method: 'PATCH', body: { imageId, image_id: imageId } }
  ),
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
  list: (params) => apiClient(withQuery('/admin/customers', params), { method: 'GET' }),
  get: (id) => apiClient(`/admin/customers/${id}`, { method: 'GET' }),
  updateBlock: (id, blocked) => apiClient(`/admin/customers/${id}/block`, { method: 'PATCH', body: { blocked } }),
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
  getSales: (params) => apiClient(withQuery('/admin/reports/sales', params), { method: 'GET' }),
  getCustomers: (params) => apiClient(withQuery('/admin/reports/customers', params), { method: 'GET' }),
  getTopProducts: (params) => apiClient(withQuery('/admin/reports/top-products', params), { method: 'GET' }),
};

export const HealthApi = {
  check: () => apiClient('/health', { method: 'GET', root: true }),
};

export const AuditApi = {
  list: (params) => apiClient(withQuery('/admin/audit', params), { method: 'GET' }),
};

export const MobileDashboardApi = {
  listSections: () => apiClient('/admin/dashboard-sections', { method: 'GET' }),
  createSection: (data) => apiClient('/admin/dashboard-sections', { method: 'POST', body: data }),
  reorderSections: (sectionIds) => apiClient('/admin/dashboard-sections/reorder', { method: 'PATCH', body: { sectionIds } }),
  getSection: (id) => apiClient(`/admin/dashboard-sections/${id}`, { method: 'GET' }),
  updateSection: (id, data) => apiClient(`/admin/dashboard-sections/${id}`, { method: 'PATCH', body: data }),
  deleteSection: (id) => apiClient(`/admin/dashboard-sections/${id}`, { method: 'DELETE' }),
  addSectionItem: (id, item) => apiClient(`/admin/dashboard-sections/${id}/items`, { method: 'POST', body: item }),
  reorderSectionItems: (id, itemIds) => apiClient(`/admin/dashboard-sections/${id}/items/reorder`, { method: 'PATCH', body: { itemIds } }),
  updateSectionItem: (id, itemId, data) => apiClient(`/admin/dashboard-sections/${id}/items/${itemId}`, { method: 'PATCH', body: data }),
  deleteSectionItem: (id, itemId) => apiClient(`/admin/dashboard-sections/${id}/items/${itemId}`, { method: 'DELETE' }),
};

