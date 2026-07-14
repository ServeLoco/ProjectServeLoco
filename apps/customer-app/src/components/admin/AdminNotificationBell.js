import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import AppIcon from '../AppIcon';
import { adminApi, subscribeAdminRealtime } from '../../api';

const TYPE_LABELS = {
  new_order: 'New order',
  new_customer: 'New customer',
  shop_rejected: 'Shop rejected',
  order_auto_cancelled: 'Order auto-cancelled',
  rider_assignment_failed: 'Rider assignment failed',
  rider_zero_available: 'No riders available',
  order_cancelled_no_rider: 'Order cancelled — no rider',
};

// Order id lives in related_id for every order-linked notification type —
// mirrors apps/admin AdminNotificationsBell's related_url->navigate, but the
// mobile app doesn't have client-side routes so we map type -> screen instead.
const ORDER_TYPES = new Set([
  'new_order', 'order_auto_cancelled', 'rider_assignment_failed',
  'rider_zero_available', 'order_cancelled_no_rider',
]);

function formatRelativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * AdminNotificationBell — parity with apps/admin's header bell (web admin's
 * "track updates" feed). Badge stays live via the admin socket
 * (admin.notification.created / admin.notification.unread_count); opening the
 * panel marks everything read, same as web.
 */
export default function AdminNotificationBell() {
  const navigation = useNavigation();
  const [unread, setUnread] = useState(0);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const autoMarkedRef = useRef(false);

  useEffect(() => {
    adminApi.getInboxUnreadCount()
      .then((res) => setUnread(res?.count || 0))
      .catch(() => {});

    const unsubCreated = subscribeAdminRealtime('admin.notification.created', (payload) => {
      if (!payload) return;
      setItems((prev) => (
        prev.some((it) => it.id === payload.id) ? prev : [payload, ...prev].slice(0, 50)
      ));
      if (!payload.read_at) setUnread((c) => c + 1);
    });
    const unsubCount = subscribeAdminRealtime('admin.notification.unread_count', (payload) => {
      setUnread(payload?.count || 0);
    });

    return () => {
      unsubCreated();
      unsubCount();
    };
  }, []);

  const openPanel = useCallback(() => {
    setVisible(true);
    setLoading(true);
    autoMarkedRef.current = false;
    adminApi.getInbox(20)
      .then((res) => setItems(res?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const closePanel = useCallback(() => setVisible(false), []);

  // Auto-mark-all-read once per open, matching web's bell behavior — opening
  // the panel is the "I've seen these" signal, no per-item tap needed.
  useEffect(() => {
    if (!visible || autoMarkedRef.current) return;
    autoMarkedRef.current = true;
    adminApi.markAllInboxRead()
      .then(() => {
        setUnread(0);
        setItems((prev) => prev.map((it) => (it.read_at ? it : { ...it, read_at: new Date().toISOString() })));
      })
      .catch(() => {});
  }, [visible]);

  const handleItemPress = useCallback((item) => {
    closePanel();
    if (ORDER_TYPES.has(item.type) && item.related_id) {
      navigation.navigate('AdminOrderDetail', { orderId: item.related_id });
    } else if (item.type === 'new_customer') {
      navigation.navigate('AdminPeople');
    }
  }, [navigation, closePanel]);

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => handleItemPress(item)}>
      {!item.read_at ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowType}>{TYPE_LABELS[item.type] || item.type}</Text>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title || item.body}</Text>
        {item.title && item.body ? <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text> : null}
        <Text style={styles.rowWhen}>{formatRelativeTime(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        style={styles.bellBtn}
        onPress={openPanel}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <AppIcon name="notification" size={20} color={colors.textPrimary} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={closePanel}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={closePanel} />
          <SafeAreaView style={styles.panel} edges={['bottom']}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Notifications</Text>
              <TouchableOpacity onPress={closePanel} accessibilityRole="button" accessibilityLabel="Close">
                <AppIcon name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>You're all caught up.</Text>
                  </View>
                }
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    marginTop: 4, width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSurface,
  },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.saffronDark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: colors.textInverse, fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  panel: {
    backgroundColor: colors.bgApp, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '75%', ...shadows.lg,
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  panelTitle: { ...typography.h3, color: colors.textPrimary },
  listContent: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.saffronDark, marginTop: 6 },
  dotSpacer: { width: 8, height: 8, marginTop: 6 },
  rowType: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  rowTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  rowBody: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowWhen: { fontSize: 11, color: colors.textTertiary, marginTop: 4, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
});
