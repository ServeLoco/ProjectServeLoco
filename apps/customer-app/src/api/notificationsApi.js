import { apiClient } from './httpClient';
import { mapNotification } from '../utils/apiMappers';

export const list = async (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.set(k, v);
  });
  const query = qs.toString();
  const endpoint = query ? `/notifications?${query}` : '/notifications';
  
  const res = await apiClient.get(endpoint, { auth: 'customer' });
  return {
    ...res,
    data: (res?.data || []).map(mapNotification)
  };
};

export const getUnreadCount = async () => {
  const res = await apiClient.get('/notifications/unread-count', { auth: 'customer' });
  return res?.unreadCount || 0;
};

export const markAllRead = async () => {
  return apiClient.patch('/notifications/read-all', null, { auth: 'customer' });
};

export const markRead = async (id) => {
  return apiClient.patch(`/notifications/${id}/read`, null, { auth: 'customer' });
};

export const deleteNotification = async (id) => {
  return apiClient.delete(`/notifications/${id}`, { auth: 'customer' });
};

export const clearAll = async () => {
  return apiClient.delete('/notifications/clear-all', { auth: 'customer' });
};

export default {
  list,
  getUnreadCount,
  markAllRead,
  markRead,
  deleteNotification,
  clearAll,
};
