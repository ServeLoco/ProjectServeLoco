import { apiClient } from './httpClient';

const adminCategoriesApi = {
  createCategory: payload => apiClient.post('/admin/categories', payload, { auth: 'admin' }),
  deleteCategory: id => apiClient.delete(`/admin/categories/${id}`, { auth: 'admin' }),
  getCategories: () => apiClient.get('/admin/categories', { auth: 'admin' }),
  updateCategory: (id, payload) => apiClient.patch(`/admin/categories/${id}`, payload, { auth: 'admin' }),
};

export { adminCategoriesApi };
