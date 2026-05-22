import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const productsApi = {
  getCategories: params => apiClient.get(`/categories${buildQueryString(params)}`),
  getProduct: id => apiClient.get(`/products/${id}`),
  getProducts: params => apiClient.get(`/products${buildQueryString(params)}`),
};

export { productsApi };
