import { apiClient } from './client';

export const dashboardApi = {
  getDashboard: (storeType, extra = {}) =>
    apiClient.get('/dashboard', {
      params: { storeType, ...extra },
    }),
};
