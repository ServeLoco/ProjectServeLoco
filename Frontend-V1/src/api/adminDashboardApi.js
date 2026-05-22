import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const adminDashboardApi = {
  getDashboard: () => apiClient.get('/admin/dashboard', { auth: 'admin' }),
  getSalesReport: params => apiClient.get(
    `/admin/reports/sales${buildQueryString(params)}`,
    { auth: 'admin' },
  ),
};

export { adminDashboardApi };
