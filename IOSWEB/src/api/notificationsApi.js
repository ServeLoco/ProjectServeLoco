import { apiClient } from './client';

export const notificationsApi = {
  list: (params) => apiClient.get('/notifications', { params }),
  getUnreadCount: () => apiClient.get('/notifications/unread-count'),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
  markRead: (id) => apiClient.patch(`/notifications/${id}/read`),
  deleteNotification: (id) => apiClient.delete(`/notifications/${id}`),
};
