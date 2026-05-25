import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const productsApi = {
  getCategories: params => apiClient.get(`/categories${buildQueryString(params)}`),
  getProduct: (id, params) => apiClient.get(`/products/${id}${buildQueryString(params)}`),
  getProducts: params => apiClient.get(`/products${buildQueryString(params)}`),
};

export { productsApi };
