import { apiClient } from './httpClient';

const adminProductsApi = {
  attachImage: (id, payload) => apiClient.patch(
    `/admin/products/${id}/image`,
    payload,
    { auth: 'admin' },
  ),
  createProduct: payload => apiClient.post('/admin/products', payload, { auth: 'admin' }),
  deleteProduct: id => apiClient.delete(`/admin/products/${id}`, { auth: 'admin' }),
  getProduct: id => apiClient.get(`/admin/products/${id}`, { auth: 'admin' }),
  getProducts: () => apiClient.get('/admin/products', { auth: 'admin' }),
  updateAvailability: (id, payload) => apiClient.patch(
    `/admin/products/${id}/availability`,
    payload,
    { auth: 'admin' },
  ),
  updateProduct: (id, payload) => apiClient.patch(
    `/admin/products/${id}`,
    payload,
    { auth: 'admin' },
  ),
};

export { adminProductsApi };
