import { storage } from '../utils/storage';
import { normalizeKeys } from '../utils/normalizer';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const apiClient = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const token = storage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
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

    return normalizeKeys(data);
  } catch (error) {
    return Promise.reject(error);
  }
};
