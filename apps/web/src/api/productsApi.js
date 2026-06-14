import { apiClient } from './client';

export const productsApi = {
  getProducts: (params) => apiClient.get('/products', { params }),
  getProduct: (id, type) => apiClient.get(`/products/${id}`, { params: { type } }),
  getCategories: (type) => apiClient.get('/categories', { params: { type } }),
};
