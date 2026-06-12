import { apiClient } from './client';

export const dashboardApi = {
  getDashboard: (storeType) => apiClient.get('/dashboard', { params: { storeType } }),
};
