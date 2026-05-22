import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const adminOrdersApi = {
  getOrder: id => apiClient.get(`/admin/orders/${id}`, { auth: 'admin' }),
  getOrders: params => apiClient.get(
    `/admin/orders${buildQueryString(params)}`,
    { auth: 'admin' },
  ),
  updatePayment: (id, payload) => apiClient.patch(
    `/admin/orders/${id}/payment`,
    payload,
    { auth: 'admin' },
  ),
  updateStatus: (id, payload) => apiClient.patch(
    `/admin/orders/${id}/status`,
    payload,
    { auth: 'admin' },
  ),
};

export { adminOrdersApi };
