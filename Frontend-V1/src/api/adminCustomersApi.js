import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const adminCustomersApi = {
  getCustomers: params => apiClient.get(
    `/admin/customers${buildQueryString(params)}`,
    { auth: 'admin' },
  ),
  updateBlock: (id, payload) => apiClient.patch(
    `/admin/customers/${id}/block`,
    payload,
    { auth: 'admin' },
  ),
  updateTrust: (id, payload) => apiClient.patch(
    `/admin/customers/${id}/trust`,
    payload,
    { auth: 'admin' },
  ),
};

export { adminCustomersApi };
