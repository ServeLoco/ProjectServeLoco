import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  StyleSheet, Text, View, FlatList, Animated, Easing,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { AppScreen, AppHeader, AppIcon, ErrorState } from '../../../components';
import { colors, radius, shadows } from '../../../theme';
import { notificationsApi, subscribeNotificationEvents, subscribeRealtimeLifecycle } from '../../../api';
import { useAuthStore } from '../../../stores';
import { mapNotification } from '../../../utils';
import { useRefetchOnFocus } from '../../../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../../../utils/motionPreferences';

// ── Per-type visual config ───────────────────────────────────────────────────
const TYPE_CONFIG = {
  order:   { iconName: 'shoppingBag', color: '#5B5BD6', bg: '#EFEFF9', label: 'Order' },
  success: { iconName: 'check',        color: '#179E62', bg: '#EAFDF5', label: 'Success' },
  info:    { iconName: 'notification', color: '#3B82F6', bg: '#EFF6FF', label: 'Update' },
  warning: { iconName: 'warning',      color: '#D97706', bg: '#FFF7E6', label: 'Alert' },
  offer:   { iconName: 'ticket',       color: '#E05A1A', bg: '#FFF2EB', label: 'Offer' },
  admin:   { iconName: 'settings',     color: '#6B7280', bg: '#F3F4F6', label: 'Admin' },
};
const FALLBACK_TYPE_CONFIG = TYPE_CONFIG.info;

// Order-status look, picked from the notification title so each step of an
// order gets its own colour (instead of every update being a blue bell).
// First match wins; no match falls back to the type config above.
const STATUS_TONES = [
  { test: /cancel|reject|refund/i,           iconName: 'close',       color: '#C93B40', bg: '#FFF0F0', label: 'Cancelled' },
  { test: /delivered/i,                      iconName: 'check',       color: '#179E62', bg: '#EAFDF5', label: 'Delivered' },
  { test: /on the way|out for delivery/i,    iconName: 'navigation',  color: '#D97706', bg: '#FFF7E6', label: 'On the way' },
  { test: /rider|delivery partner/i,         iconName: 'navigation',  color: '#0E9384', bg: '#E8FAF7', label: 'Rider' },
  { test: /prepar|packing/i,                 iconName: 'box',         color: '#E05A1A', bg: '#FFF2EB', label: 'Preparing' },
  { test: /accepted/i,                       iconName: 'check',       color: '#1D4ED8', bg: '#EFF6FF', label: 'Accepted' },
  { test: /confirmed|placed/i,               iconName: 'shoppingBag', color: '#5B5BD6', bg: '#EFEFF9', label: 'Placed' },
];

// Offers and admin messages keep their own look; for the rest the title
// decides first, then the body.
const getTone = (n) => {
  if (n.type === 'offer' || n.type === 'admin') return TYPE_CONFIG[n.type];
  return STATUS_TONES.find(t => t.test.test(n.title || ''))
    || STATUS_TONES.find(t => t.test.test(n.body || ''))
    || TYPE_CONFIG[n.type]
    || FALLBACK_TYPE_CONFIG;
};

// Emoji code points: pictographs, symbols/dingbats/arrows, ZWJ, variation
// selectors, keycap, tag characters, ©/®.
const isEmojiCodePoint = (cp) => (
  cp >= 0x1F000
  || (cp >= 0x2190 && cp <= 0x2BFF)
  || cp === 0x200D || cp === 0x20E3
  || (cp >= 0xFE00 && cp <= 0xFE0F)
  || (cp >= 0xE0020 && cp <= 0xE007F)
  || cp === 0x00A9 || cp === 0x00AE
);

// "👨‍🍳 Preparing Your Order" → { emoji: '👨‍🍳', text: 'Preparing Your Order' }.
// Only a leading word made entirely of emoji code points counts, so titles
// in any script (Hindi etc.) are left alone.
const splitLeadingEmoji = (title = '') => {
  const trimmed = String(title).trim();
  const space = trimmed.indexOf(' ');
  if (space <= 0) return { emoji: null, text: trimmed };
  const head = trimmed.slice(0, space);
  const isEmoji = Array.from(head).every(ch => isEmojiCodePoint(ch.codePointAt(0)));
  if (!isEmoji) return { emoji: null, text: trimmed };
  return { emoji: head, text: trimmed.slice(space + 1).trim() };
};

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
// Rows carry _isFirst/_isLast so each day draws as one bordered box.
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
    flat.push({ _key: `hdr-${label}`, _isHeader: true, label, count: items.length });
    items.forEach((n, i) => flat.push({
      _key: String(n.id),
      _isHeader: false,
      _isFirst: i === 0,
      _isLast: i === items.length - 1,
      ...n,
    }));
  }
  return flat;
};

// ── Row ──────────────────────────────────────────────────────────────────────
// Module scope + memo so FlatList re-renders don't remount rows (and replay
// the slide-in). `introDelay` is null for rows that should just appear.
const NotificationRow = memo(function NotificationRow({ item, introDelay, onOpen, onDismiss }) {
  const anim = useRef(new Animated.Value(introDelay == null ? 1 : 0)).current;

  useEffect(() => {
    if (introDelay == null) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 360,
      delay: introDelay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  // Runs once on mount — the intro never replays for the same row.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = getTone(item);
  const { emoji, text: titleText } = splitLeadingEmoji(item.title);
  const orderId = getNotificationOrderId(item);
  const isTappable = Boolean(orderId);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      <TouchableOpacity
        activeOpacity={isTappable ? 0.7 : 1}
        onPress={() => isTappable && onOpen(item)}
        style={[
          styles.row,
          item._isFirst && styles.rowFirst,
          item._isLast && styles.rowLast,
          !item.read && styles.rowUnread,
        ]}
      >
        {/* Timeline line joining the icons of one day */}
        {!item._isFirst && <View style={[styles.timeline, styles.timelineTop]} />}
        {!item._isLast && <View style={[styles.timeline, styles.timelineBottom]} />}

        {/* Icon: the title's own emoji when it has one */}
        <View style={[styles.iconWrap, { backgroundColor: tone.bg, borderColor: tone.color + '33' }]}>
          {emoji
            ? <Text style={styles.iconEmoji}>{emoji}</Text>
            : <AppIcon name={tone.iconName} size={19} color={tone.color} strokeWidth={2.2} />}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={2}>
              {titleText}
            </Text>
            {!item.read && <View style={[styles.unreadDot, { backgroundColor: tone.color }]} />}
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => onDismiss(item.id)}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Remove notification"
            >
              <AppIcon name="close" size={11} color={colors.textSecondary} strokeWidth={2.6} />
            </TouchableOpacity>
          </View>

          {!!item.body && <Text style={styles.body} numberOfLines={3}>{item.body}</Text>}

          <View style={styles.metaRow}>
            <View style={[styles.tonePill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.tonePillText, { color: tone.color }]}>{tone.label}</Text>
            </View>
            <Text style={styles.timeText}>{item.timeLabel}</Text>
            <View style={styles.metaSpacer} />
            {isTappable && (
              <View style={styles.viewOrder}>
                <Text style={styles.viewOrderText}>View order</Text>
                <AppIcon name="chevronRight" size={12} color={colors.textPrimary} strokeWidth={2.6} />
              </View>
            )}
          </View>
        </View>

        {/* Hairline between rows inside one day box */}
        {!item._isLast && <View style={styles.divider} />}
      </TouchableOpacity>
    </Animated.View>
  );
});

// Rows that mount within this long after the list first shows slide in;
// later ones (scrolling, live inserts) just appear.
const INTRO_WINDOW_MS = 1200;
const INTRO_STAGGER_MS = 55;
const INTRO_MAX_STAGGERED = 8;

// ── Screen ───────────────────────────────────────────────────────────────────
export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const refreshTimer = useRef(null);

  const flatData = useMemo(() => buildFlatData(notifications), [notifications]);
  const hasNotifications = notifications.length > 0;
  const [clearingAll, setClearingAll] = useState(false);
  const reduceMotion = useReducedMotion();
  // When the list first had rows on screen; drives the one-time slide-in.
  const introStartedAt = useRef(null);
  if (introStartedAt.current == null && flatData.length > 0 && !loading) {
    introStartedAt.current = Date.now();
  }

  useEffect(() => {
    if (isAuthenticated) fetchNotifications();
    else setLoading(false);
  }, [isAuthenticated, reloadToken]);

  // silent: reload behind the list already on screen (screen refocus).
  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setIsError(false);
      }
      const res = await notificationsApi.list({ limit: 50 });
      const items = res.data || [];
      setNotifications(items);
      // Mark as read in the background for badge count — do not block the
      // header actions on unread state (users still need Clear all).
      if (items.some(n => !n.read)) {
        // Capture which ids this call is marking read — a notification that
        // streams in via socket after this fires but before it resolves
        // must not be flipped to read by the stale closure below.
        const idsBeingMarkedRead = new Set(items.filter(n => !n.read).map(n => n.id));
        notificationsApi.markAllRead()
          .then(() => {
            setNotifications(prev => prev.map(
              n => idsBeingMarkedRead.has(n.id) ? { ...n, read: true } : n
            ));
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to fetch notifications', err);
      // A quiet reload that fails keeps the list already on screen.
      if (!silent) setIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useRefetchOnFocus(() => fetchNotifications({ silent: true }), { enabled: isAuthenticated });

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

  const clearNotification = useCallback(async (id) => {
    try {
      await notificationsApi.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.warn('Failed to delete notification', err);
    }
  }, []);

  const clearAllNotifications = useCallback(() => {
    if (!hasNotifications || clearingAll) return;
    Alert.alert(
      'Clear all notifications?',
      'This removes every notification from your inbox. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            setClearingAll(true);
            try {
              await notificationsApi.clearAll();
              setNotifications([]);
            } catch (err) {
              console.warn('Failed to clear all notifications', err);
              Alert.alert('Could not clear', err?.message || 'Try again.');
            } finally {
              setClearingAll(false);
            }
          },
        },
      ],
    );
  }, [hasNotifications, clearingAll]);

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

  const renderItem = useCallback(({ item, index }) => {
    // ── Section header ──
    if (item._isHeader) {
      return (
        <View style={[styles.sectionHeader, index === 0 && styles.sectionHeaderFirst]}>
          <Text style={styles.sectionLabel}>{item.label}</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{item.count}</Text>
          </View>
        </View>
      );
    }

    const inIntro = !reduceMotion
      && introStartedAt.current != null
      && Date.now() - introStartedAt.current < INTRO_WINDOW_MS;

    return (
      <NotificationRow
        item={item}
        introDelay={inIntro ? Math.min(index, INTRO_MAX_STAGGERED) * INTRO_STAGGER_MS : null}
        onOpen={openNotification}
        onDismiss={clearNotification}
      />
    );
  }, [openNotification, clearNotification, reduceMotion]);

  return (
    <AppScreen style={styles.screen} bg={colors.bgSurface} safeAreaBottom>
      <AppHeader
        title="Notifications"
        bordered
        onBack={() => navigation.goBack()}
        rightActions={
          hasNotifications
            ? [{
                icon: (
                  <Text style={[styles.clearAllBtn, clearingAll && styles.clearAllBtnDisabled]}>
                    {clearingAll ? 'Clearing…' : 'Clear all'}
                  </Text>
                ),
                onPress: clearAllNotifications,
                label: 'Clear all notifications',
                style: styles.clearAllWrap,
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
          <View style={styles.emptyIconOuter}>
            <View style={styles.emptyIconBg}>
              <AppIcon name="profile" size={32} color={colors.textPrimary} strokeWidth={2} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptySubtitle}>Log in to see your notifications.</Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={item => item._key}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, !hasNotifications && styles.listContentEmpty]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconOuter}>
                <View style={styles.emptyIconBg}>
                  <AppIcon name="notification" size={32} color={colors.textPrimary} strokeWidth={2} />
                </View>
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
// Light greys that carry the structure on the plain white page (same as the
// My Orders page).
const LINE = '#ECEEF2';
const MUTED_BG = '#F5F6F8';
const UNREAD_BG = '#F7F9FF';
const ICON_SIZE = 42;
const ROW_PAD = 12;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgSurface,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 6,
  },
  sectionHeaderFirst: {
    paddingTop: 14,
  },
  sectionLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: MUTED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },

  // ── Row (rows of one day share a bordered box) ──
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: ROW_PAD,
    backgroundColor: colors.bgSurface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: LINE,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  rowUnread: {
    backgroundColor: UNREAD_BG,
  },
  timeline: {
    position: 'absolute',
    left: ROW_PAD + ICON_SIZE / 2 - 1,
    width: 2,
    backgroundColor: LINE,
  },
  timelineTop: {
    top: 0,
    height: ROW_PAD,
  },
  timelineBottom: {
    top: ROW_PAD + ICON_SIZE,
    bottom: 0,
  },
  divider: {
    position: 'absolute',
    left: ROW_PAD + ICON_SIZE + 12,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: LINE,
  },

  // ── Icon ──
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconEmoji: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },

  // ── Content ──
  content: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  title: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  titleUnread: {
    fontWeight: '800',
  },
  dismissBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MUTED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  // ── Meta row (type · time ... View order) ──
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  tonePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tonePillText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  metaSpacer: {
    flex: 1,
  },
  viewOrder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewOrderText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  // ── Header right button ──
  clearAllWrap: {
    width: 'auto',
    minWidth: 80,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: MUTED_BG,
    borderColor: MUTED_BG,
    shadowOpacity: 0,
    elevation: 0,
  },
  clearAllBtn: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.error,
  },
  clearAllBtnDisabled: {
    opacity: 0.5,
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIconOuter: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: MUTED_BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
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
