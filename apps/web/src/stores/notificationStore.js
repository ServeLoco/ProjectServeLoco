import { create } from 'zustand';
import { notificationsApi } from '../api/notificationsApi';

export const useNotificationStore = create((set) => ({
  unreadCount: 0,
  
  setUnreadCount: (count) => set({ unreadCount: count }),
  
  fetchUnreadCount: async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      const payload = res.data || res;
      let count = 0;
      if (typeof payload === 'number') {
        count = payload;
      } else if (payload && typeof payload === 'object') {
        const candidate = payload.unreadCount ?? payload.count ?? payload.unread_count;
        count = typeof candidate === 'number' ? candidate : 0;
      }
      set({ unreadCount: count });
    } catch (error) {
      console.error('Failed to fetch unread count', error);
    }
  },

  decrementUnread: () => set((state) => ({ 
    unreadCount: Math.max(0, state.unreadCount - 1) 
  })),

  markAllRead: () => set({ unreadCount: 0 })
}));
