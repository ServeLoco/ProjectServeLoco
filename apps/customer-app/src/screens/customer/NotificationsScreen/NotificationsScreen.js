import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppScreen, AppHeader, AppIcon } from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';
import { notificationsApi, subscribeNotificationEvents, subscribeRealtimeLifecycle } from '../../../api';
import { useAuthStore } from '../../../stores';
import { mapNotification } from '../../../utils';

const parseActionPayload = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getNotificationOrderId = (notification = {}) => {
  const actionPayload = parseActionPayload(notification.actionPayload);
  const payloadOrderId = actionPayload?.orderId || actionPayload?.order_id;

  if (payloadOrderId) return String(payloadOrderId);

  const isOrderSource = String(notification.sourceType || '').toLowerCase() === 'order';
  if (isOrderSource && notification.sourceId) return String(notification.sourceId);

  return null;
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const refreshTimer = useRef(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationsApi.list({ limit: 50 });
      setNotifications(res.data || []);
      
      const hasUnread = (res.data || []).some(n => !n.read);
      if (hasUnread) {
        // Mark all as read on the backend automatically
        await notificationsApi.markAllRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      console.warn('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const queueRefresh = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
    }

    refreshTimer.current = setTimeout(() => {
      if (isAuthenticated) {
        fetchNotifications();
      }
    }, 350);
  }, [fetchNotifications, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const unsubscribeNotifications = subscribeNotificationEvents(({ eventName, payload }) => {
      if (eventName !== 'notification.created') return;

      const notification = mapNotification(payload);
      setNotifications(prev => {
        if (prev.some(item => String(item.id) === String(notification.id))) {
          return prev;
        }
        return [notification, ...prev].slice(0, 50);
      });
    });

    const unsubscribeLifecycle = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') {
        queueRefresh();
      }
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeLifecycle();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, [isAuthenticated, queueRefresh]);

  const markAllAsRead = async () => {
    if (!isAuthenticated) return;
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.warn('Failed to mark all as read', err);
    }
  };

  const clearNotification = async (id) => {
    if (!isAuthenticated) return;
    try {
      await notificationsApi.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.warn('Failed to delete notification', err);
    }
  };

  const openNotification = async (notification) => {
    const orderId = getNotificationOrderId(notification);
    if (!orderId) return;

    if (!notification.read) {
      setNotifications(prev => prev.map(n => (
        String(n.id) === String(notification.id) ? { ...n, read: true } : n
      )));
      notificationsApi.markRead(notification.id).catch(() => {});
    }

    navigation.navigate('OrderDetail', { orderId });
  };

  const renderItem = ({ item }) => {
    let iconName = 'notification';
    let iconColor = colors.primary;
    const orderId = getNotificationOrderId(item);

    if (item.type === 'success') {
      iconName = 'check';
      iconColor = colors.success || '#4CAF50';
    } else if (item.type === 'offer') {
      iconName = 'rupee';
      iconColor = colors.saffron || '#FF9800';
    }

    return (
      <TouchableOpacity
        activeOpacity={orderId ? 0.85 : 1}
        disabled={!orderId}
        onPress={() => openNotification(item)}
        style={[styles.notificationCard, !item.read && styles.unreadCard]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconWrapper}>
            <AppIcon name={iconName} size={18} color={iconColor} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.title, !item.read && styles.unreadText]}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.time}>{item.timeLabel || item.time}</Text>
          </View>
          <TouchableOpacity
            onPress={(event) => {
              event?.stopPropagation?.();
              clearNotification(item.id);
            }}
            style={styles.deleteBtn}
          >
            <AppIcon name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom>
      <AppHeader 
        title="Notifications" 
        onBack={() => navigation.goBack()} 
        rightElement={
          notifications.some(n => !n.read) ? (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.headerRightText}>Read All</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !isAuthenticated ? (
        <View style={styles.emptyState}>
          <AppIcon name="profile" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptySubtitle}>Log in to view your notifications.</Text>
        </View>
      ) : (
        <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppIcon name="notification" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>No new notifications at the moment.</Text>
          </View>
        }
      />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadCard: {
    borderColor: colors.primary,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardContent: {
    flex: 1,
    marginRight: spacing.xs,
  },
  title: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  time: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  headerRightText: {
    ...typography.label,
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
