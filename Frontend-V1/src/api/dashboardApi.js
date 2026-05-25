import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const dashboardApi = {
  getDashboard: params => apiClient.get(`/dashboard${buildQueryString(params)}`),
  getSectionItems: (slug, params) => apiClient.get(`/dashboard/sections/${slug}/items${buildQueryString(params)}`),
};

export { dashboardApi };
