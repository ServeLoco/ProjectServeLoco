import { apiClient } from './httpClient';
import { mapNotification } from '../utils/apiMappers';

export const list = async (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.set(k, v);
  });
  const query = qs.toString();
  const endpoint = query ? `/notifications?${query}` : '/notifications';
  
  const res = await apiClient(endpoint, { method: 'GET' });
  return {
    ...res,
    data: (res.data || []).map(mapNotification)
  };
};

export const getUnreadCount = async () => {
  const res = await apiClient('/notifications/unread-count', { method: 'GET' });
  return res.unreadCount || 0;
};

export const markAllRead = async () => {
  return apiClient('/notifications/read-all', { method: 'PATCH' });
};

export const markRead = async (id) => {
  return apiClient(`/notifications/${id}/read`, { method: 'PATCH' });
};

export const deleteNotification = async (id) => {
  return apiClient(`/notifications/${id}`, { method: 'DELETE' });
};

export default {
  list,
  getUnreadCount,
  markAllRead,
  markRead,
  deleteNotification
};
