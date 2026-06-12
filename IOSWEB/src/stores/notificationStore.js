import { create } from 'zustand';
import { notificationsApi } from '../api/notificationsApi';

export const useNotificationStore = create((set) => ({
  unreadCount: 0,
  
  setUnreadCount: (count) => set({ unreadCount: count }),
  
  fetchUnreadCount: async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      const payload = res.data || res;
      set({ unreadCount: payload.unreadCount ?? payload.count ?? payload ?? 0 });
    } catch (error) {
      console.error('Failed to fetch unread count', error);
    }
  },

  decrementUnread: () => set((state) => ({ 
    unreadCount: Math.max(0, state.unreadCount - 1) 
  })),

  markAllRead: () => set({ unreadCount: 0 })
}));
