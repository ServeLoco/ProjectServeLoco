import axios from 'axios';
import { getToken } from '../utils/storage';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Guards against a redirect storm: once a 401 has triggered logout we don't
// want every other in-flight request to fire logout again.
let handlingUnauthorized = false;

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const status = error.response?.status;

    // A 401 means the JWT is missing/expired/invalid. Clear the auth slice so
    // the user is bounced to /auth instead of silently rendering protected
    // screens that bleed stale data. We only react when a token actually
    // exists — a 401 on the login call itself is just "wrong credentials".
    if (status === 401 && !handlingUnauthorized && getToken()) {
      handlingUnauthorized = true;
      try {
        // Lazy import to avoid a module init cycle
        // (client -> authStore -> realtimeClient -> client).
        const { useAuthStore } = await import('../stores/authStore');
        useAuthStore.getState().logout();
      } catch {
        // Store may not be ready; AuthGuard will still catch the missing token.
      } finally {
        handlingUnauthorized = false;
      }
    }

    // Standardize error format similar to Android's ApiError
    const customError = new Error(error.response?.data?.message || error.message || 'An unexpected error occurred');
    customError.status = status;
    customError.data = error.response?.data;
    customError.isNetworkError = !error.response;
    return Promise.reject(customError);
  }
);
