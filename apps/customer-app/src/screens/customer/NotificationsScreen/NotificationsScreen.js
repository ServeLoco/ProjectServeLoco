import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet, Text, View, FlatList,
  TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { AppScreen, AppHeader, AppIcon, ErrorState } from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';
import { notificationsApi, subscribeNotificationEvents, subscribeRealtimeLifecycle } from '../../../api';
import { useAuthStore } from '../../../stores';
import { mapNotification } from '../../../utils';

// ── Per-type visual config ───────────────────────────────────────────────────
const TYPE_CONFIG = {
  order:   { iconName: 'shoppingBag', color: '#5B5BD6', bg: '#EFEFF9', label: 'Order' },
  success: { iconName: 'check',       color: '#1FB574', bg: '#EAFDF5', label: 'Success' },
  info:    { iconName: 'notification', color: '#3B82F6', bg: '#EFF6FF', label: 'Update' },
  warning: { iconName: 'notification', color: '#F4A62A', bg: '#FFF9EC', label: 'Alert' },
  offer:   { iconName: 'rupee',        color: '#FF7A3A', bg: '#FFF2EB', label: 'Offer' },
  admin:   { iconName: 'settings',     color: '#6B7280', bg: '#F3F4F6', label: 'Admin' },
};
const FALLBACK_TYPE_CONFIG = TYPE_CONFIG.info;

// ── Helpers ──────────────────────────────────────────────────────────────────
const parseActionPayload = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const getNotificationOrderId = (n = {}) => {
  const payload = parseActionPayload(n.actionPayload);
  const fromPayload = payload?.orderId || payload?.order_id;
  if (fromPayload) return String(fromPayload);
  const isOrder = String(n.sourceType || '').toLowerCase() === 'order';
  if (isOrder && n.sourceId) return String(n.sourceId);
  return null;
};

// Build a flat list alternating section-header rows and notification rows.
const buildFlatData = (notifications) => {
  if (!notifications.length) return [];

  const todayStr = new Date().toDateString();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const yesterdayStr = yest.toDateString();

  const buckets = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of notifications) {
    const ds = n.createdAt ? new Date(n.createdAt).toDateString() : null;
    if (ds === todayStr) buckets.Today.push(n);
    else if (ds === yesterdayStr) buckets.Yesterday.push(n);
    else buckets.Earlier.push(n);
  }

  const flat = [];
  for (const [label, items] of Object.entries(buckets)) {
    if (!items.length) continue;
    flat.push({ _key: `hdr-${label}`, _isHeader: true, label });
    for (const n of items) flat.push({ _key: String(n.id), _isHeader: false, ...n });
  }
  return flat;
};

// ── Screen ───────────────────────────────────────────────────────────────────
export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const refreshTimer = useRef(null);

  const flatData = useMemo(() => buildFlatData(notifications), [notifications]);
  const hasUnread = notifications.some(n => !n.read);

  useEffect(() => {
    if (isAuthenticated) fetchNotifications();
    else setLoading(false);
  }, [isAuthenticated, reloadToken]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setIsError(false);
      const res = await notificationsApi.list({ limit: 50 });
      const items = res.data || [];
      setNotifications(items);
      if (items.some(n => !n.read)) {
        await notificationsApi.markAllRead();
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      console.warn('Failed to fetch notifications', err);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const queueRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (isAuthenticated) fetchNotifications();
    }, 350);
  }, [fetchNotifications, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const unsubN = subscribeNotificationEvents(({ eventName, payload }) => {
      if (eventName !== 'notification.created') return;
      const n = mapNotification(payload);
      setNotifications(prev => {
        if (prev.some(item => String(item.id) === String(n.id))) return prev;
        return [n, ...prev].slice(0, 50);
      });
    });

    const unsubL = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') queueRefresh();
    });

    return () => {
      unsubN();
      unsubL();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [isAuthenticated, queueRefresh]);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.warn('Failed to mark all as read', err);
    }
  }, []);

  const clearNotification = useCallback(async (id) => {
    try {
      await notificationsApi.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.warn('Failed to delete notification', err);
    }
  }, []);

  const openNotification = useCallback(async (n) => {
    const orderId = getNotificationOrderId(n);
    if (!orderId) return;
    if (!n.read) {
      setNotifications(prev => prev.map(item =>
        String(item.id) === String(n.id) ? { ...item, read: true } : item
      ));
      notificationsApi.markRead(n.id).catch(() => {});
    }
    navigation.navigate('OrderDetail', { orderId });
  }, [navigation]);

  const renderItem = useCallback(({ item }) => {
    // ── Section header ──
    if (item._isHeader) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{item.label}</Text>
        </View>
      );
    }

    const config = TYPE_CONFIG[item.type] || FALLBACK_TYPE_CONFIG;
    const orderId = getNotificationOrderId(item);
    const isTappable = Boolean(orderId);

    return (
      <TouchableOpacity
        activeOpacity={isTappable ? 0.7 : 0.95}
        onPress={() => isTappable && openNotification(item)}
        style={[styles.card, !item.read && styles.cardUnread]}
      >
        {/* Icon + unread dot */}
        <View style={styles.iconCol}>
          <View style={[styles.iconWrap, { backgroundColor: config.bg }]}>
            <AppIcon name={config.iconName} size={22} color={config.color} strokeWidth={1.9} />
          </View>
          {!item.read && <View style={[styles.unreadDot, { backgroundColor: config.color }]} />}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title row */}
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, !item.read && styles.titleUnread]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => clearNotification(item.id)}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <AppIcon name="close" size={13} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <Text style={styles.body} numberOfLines={3}>{item.body}</Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={[styles.typePill, { backgroundColor: config.bg }]}>
              <Text style={[styles.typePillText, { color: config.color }]}>
                {config.label}
              </Text>
            </View>
            <View style={styles.metaSpacer} />
            <Text style={styles.timeText}>{item.timeLabel}</Text>
            {isTappable && (
              <AppIcon
                name="chevronRight"
                size={13}
                color={colors.textTertiary}
                style={styles.chevron}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [openNotification, clearNotification]);

  return (
    <AppScreen style={styles.screen} safeAreaBottom>
      <AppHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        rightActions={
          hasUnread
            ? [{
                icon: <Text style={styles.markReadBtn}>Mark all read</Text>,
                onPress: markAllAsRead,
                label: 'Mark all as read',
                style: { width: 'auto', paddingHorizontal: 10 },
              }]
            : []
        }
      />

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError && notifications.length === 0 ? (
        <ErrorState
          message="Unable to load notifications. Tap to retry."
          onRetry={() => setReloadToken(value => value + 1)}
          retryLabel="Retry"
        />
      ) : !isAuthenticated ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBg}>
            <AppIcon name="profile" size={36} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptySubtitle}>Log in to see your notifications.</Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={item => item._key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBg}>
                <AppIcon name="notification" size={36} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>You're all caught up!</Text>
              <Text style={styles.emptySubtitle}>
                No notifications yet. We'll let you know when something happens.
              </Text>
            </View>
          }
        />
      )}
    </AppScreen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CARD_RADIUS = 16;
const ICON_SIZE = 48;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 10,
  },

  // ── Section header ──
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Card ──
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgSurface,
    borderRadius: CARD_RADIUS,
    padding: 14,
    gap: 12,
    // Shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardUnread: {
    backgroundColor: '#F6F7FF',
  },

  // ── Icon column ──
  iconCol: {
    position: 'relative',
    width: ICON_SIZE,
    height: ICON_SIZE,
    flexShrink: 0,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#F6F7FF',
  },

  // ── Content ──
  content: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  titleUnread: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dismissBtn: {
    marginTop: 2,
    padding: 2,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  // ── Meta row (pill + time + chevron) ──
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  metaSpacer: {
    flex: 1,
  },
  timeText: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 2,
  },

  // ── Header right button ──
  markReadBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgDisabled,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
});
