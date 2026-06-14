import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import {
  connectCustomerRealtime,
  disconnectCustomerRealtime,
  subscribeNotificationEvents,
  subscribeOrderEvents
} from '../api/realtimeClient';
import { isStandalone } from '../utils/deviceDetect';

export default function RealtimeManager() {
  const token = useAuthStore(state => state.token);
  const fetchUnreadCount = useNotificationStore(state => state.fetchUnreadCount);

  useEffect(() => {
    // Only ask for notification permission once the user is logged in AND
    // the app is running as an installed PWA. Asking on a guest visit to /
    // burns the browser's once-per-origin prompt for nothing.
    if (!token) return;
    if (!isStandalone()) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    Notification.requestPermission();
  }, [token]);

  useEffect(() => {
    if (!token) {
      disconnectCustomerRealtime();
      return;
    }

    connectCustomerRealtime(token);

    const showPushNotification = (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icons/icon-192.png' });
      }
    };

    const unsubNotifications = subscribeNotificationEvents(({ eventName, payload }) => {
      // Unread count can change on either notification event; always refresh.
      fetchUnreadCount();
      if (eventName === 'notification.created' && payload) {
        showPushNotification(payload.title || 'New Notification', payload.message || 'You have a new update.');
      }
    });

    const unsubOrders = subscribeOrderEvents(({ eventName, payload }) => {
      // Only refresh the unread count when the order event is one that can
      // plausibly change the badge (cancellation or update), not on every
      // 'order.created' (the same user can't be the one who placed it).
      if (eventName === 'order.cancelled' || eventName === 'order.updated') {
        fetchUnreadCount();
      }
      if (eventName === 'order.status.updated' && payload) {
        showPushNotification(
          `Order Update`,
          `Order #${payload.orderNumber || payload.orderId} status changed to ${payload.status}`
        );
      }
    });

    return () => {
      unsubNotifications();
      unsubOrders();
    };
  }, [token, fetchUnreadCount]);

  return null;
}
