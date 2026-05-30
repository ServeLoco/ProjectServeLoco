import { storage } from '../utils/storage';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE) {
  throw new Error('VITE_API_BASE_URL environment variable is not set');
}
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return 'http://localhost:3000';
  }
})();

export const apiClient = async (endpoint, options = {}) => {
  const { root = false, ...requestOptions } = options;
  const baseUrl = root ? API_ORIGIN : API_BASE;
  const url = `${baseUrl}${endpoint}`;
  
  const headers = {
    ...requestOptions.headers,
  };

  if (!(requestOptions.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const token = storage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...requestOptions,
    headers,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    
    if (response.status === 401) {
      storage.clearToken();
      window.location.href = '/login';
      return Promise.reject(new Error('Unauthorized'));
    }

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || response.statusText || 'API request failed';
      return Promise.reject(new Error(errorMsg));
    }

    return data;
  } catch (error) {
    return Promise.reject(error);
  }
};
