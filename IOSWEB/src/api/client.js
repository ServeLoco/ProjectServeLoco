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

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // Standardize error format similar to Android's ApiError
    const customError = new Error(error.response?.data?.message || error.message || 'An unexpected error occurred');
    customError.status = error.response?.status;
    customError.data = error.response?.data;
    customError.isNetworkError = !error.response;
    return Promise.reject(customError);
  }
);
