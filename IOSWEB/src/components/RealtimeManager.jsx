import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { 
  connectCustomerRealtime, 
  disconnectCustomerRealtime, 
  subscribeNotificationEvents, 
  subscribeOrderEvents 
} from '../api/realtimeClient';

export default function RealtimeManager() {
  const token = useAuthStore(state => state.token);
  const fetchUnreadCount = useNotificationStore(state => state.fetchUnreadCount);

  useEffect(() => {
    // Request notification permissions
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!token) {
      disconnectCustomerRealtime();
      return;
    }

    // AuthStore already connects, but calling it here is safe as it re-uses the socket
    connectCustomerRealtime(token);

    const showPushNotification = (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/vite.svg' });
      }
    };

    const unsubNotifications = subscribeNotificationEvents(({ eventName, payload }) => {
      fetchUnreadCount();
      if (eventName === 'notification.created' && payload) {
        showPushNotification(payload.title || 'New Notification', payload.message || 'You have a new update.');
      }
    });

    const unsubOrders = subscribeOrderEvents(({ eventName, payload }) => {
      fetchUnreadCount();
      if (eventName === 'order.status.updated' && payload) {
        showPushNotification(`Order Update`, `Order #${payload.orderNumber || payload.orderId} status changed to ${payload.status}`);
      }
    });

    return () => {
      unsubNotifications();
      unsubOrders();
    };
  }, [token, fetchUnreadCount]);

  return null;
}
