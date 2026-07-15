import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, Animated, Easing, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';
import { shopApi, subscribeRealtime } from '../../api';
import { useNewOrderAlert } from '../../hooks/useNewOrderAlert';
import AppIcon from '../../components/AppIcon';
import ShopToggle from '../../components/shop/ShopToggle';
import NewOrderPopup from './NewOrderPopup';

function formatElapsed(startTime, nowMs) {
  const start = new Date(startTime).getTime();
  if (!startTime || Number.isNaN(start)) return '0:00:00';
  const diffSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ShopDashboardScreen
 * Premium shop-owner dashboard: live open/closed toggle, active-order queue,
 * and a non-dismissible Accept/Reject popup for incoming orders.
 */
export default function ShopDashboardScreen() {
  const shop = useAuthStore((s) => s.shop);
  const logout = useAuthStore((s) => s.logout);

  // ── Shop open/closed toggle ──────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(Boolean(shop?.isOpen));
  const [toggleBusy, setToggleBusy] = useState(false);

  // ── Orders ────────────────────────────────────────────────────────────
  const [activeOrders, setActiveOrders] = useState([]); // confirmed:true
  const [pendingQueue, setPendingQueue] = useState([]); // confirmed:false && rejected:false
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const mountedRef = useRef(true);

  // Ticking clock for the elapsed-time readout on each active order card.
  // Only ticks while there is something to show — avoids re-rendering the
  // whole screen every second when the queue is empty.
  const [now, setNow] = useState(() => Date.now());
  const hasActiveOrders = activeOrders.length > 0;
  useEffect(() => {
    if (!hasActiveOrders) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveOrders]);

  // Pulsing live dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isOpen) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOpen, pulse]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [shopRes, ordersRes] = await Promise.all([
        shopApi.getMyShop().catch(() => null),
        shopApi.getMyOrders(),
      ]);
      if (!mountedRef.current) return;
      if (shopRes?.shop) setIsOpen(Boolean(shopRes.shop.isOpen));

      const orders = ordersRes.orders || [];
      setActiveOrders(orders.filter(o => o.confirmed && !o.rejected));
      // One-at-a-time popup queue: keep existing order, append new ones
      // oldest-first so the first arrived stays on screen until Accept/Reject.
      setPendingQueue(prev => {
        const incoming = orders
          .filter(o => !o.confirmed && !o.rejected)
          .slice()
          .sort((a, b) => Number(a.id) - Number(b.id));
        const stillPendingIds = new Set(incoming.map(o => o.id));
        const kept = prev.filter(o => stillPendingIds.has(o.id));
        const keptIds = new Set(kept.map(o => o.id));
        const fresh = incoming.filter(o => !keptIds.has(o.id));
        return [...kept, ...fresh];
      });
      setLoadError(false);
    } catch (_) {
      if (mountedRef.current) setLoadError(true);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  useEffect(() => {
    // shop.order.updated: admin confirm/ready/reject, rider Out for Delivery /
    // Delivered, or cancel — refetch so Active list + Accept popup stay live.
    // shop.order.cancelled: admin cancelled whole order.
    const dropOrder = (payload) => {
      const orderId = payload?.orderId ?? payload?.order_id;
      if (orderId == null) return;
      setPendingQueue((prev) => prev.filter((o) => Number(o.id) !== Number(orderId)));
      setActiveOrders((prev) => prev.filter((o) => Number(o.id) !== Number(orderId)));
    };
    const terminalStatuses = new Set(['Delivered', 'Cancelled', 'Out for Delivery']);
    const unsubAssigned = subscribeRealtime('shop.order.assigned', () => fetchAll());
    const unsubCancelled = subscribeRealtime('shop.order.cancelled', (payload) => {
      dropOrder(payload);
      fetchAll();
    });
    const unsubUpdated = subscribeRealtime('shop.order.updated', (payload) => {
      const status = payload?.status;
      if (payload?.action === 'cancelled' || (status && terminalStatuses.has(status))) {
        // Optimistic remove so Active cards clear before the GET returns.
        dropOrder(payload);
      }
      fetchAll();
    });
    const unsubRiderAssigned = subscribeRealtime('shop.order.rider_assigned', () => fetchAll());
    const unsubRiderFailed = subscribeRealtime('shop.order.rider_failed', (payload) => {
      dropOrder(payload);
      fetchAll();
    });
    const unsubForeground = subscribeRealtime('lifecycle.foreground', () => fetchAll());
    const unsubReconnected = subscribeRealtime('lifecycle.reconnected', () => fetchAll());
    return () => {
      unsubAssigned();
      unsubCancelled();
      unsubUpdated();
      unsubRiderAssigned();
      unsubRiderFailed();
      unsubForeground();
      unsubReconnected();
    };
  }, [fetchAll]);

  // ── Repeating alert while anything is waiting in the popup queue ────
  // role: 'shop' — loud remote alarm path + no background local spam (admin uses default).
  useNewOrderAlert(pendingQueue.length > 0, { role: 'shop' });

  const currentPopupOrder = pendingQueue[0] || null;

  const dequeue = useCallback((orderId) => {
    setPendingQueue(prev => prev.filter(o => o.id !== orderId));
  }, []);

  const handleAccept = useCallback(async (orderId) => {
    const order = pendingQueue.find(o => o.id === orderId);
    await shopApi.confirmOrder(orderId);
    dequeue(orderId);
    if (order) setActiveOrders(prev => [...prev, { ...order, confirmed: true }]);
  }, [pendingQueue, dequeue]);

  const handleReject = useCallback(async (orderId) => {
    await shopApi.rejectOrder(orderId);
    dequeue(orderId);
  }, [dequeue]);

  // ── Active-order actions: Cancel / Ready ─────────────────────────────
  const [actionBusy, setActionBusy] = useState({}); // { [orderId]: 'cancel' | 'ready' }

  const handleCancelOrder = useCallback((orderId) => {
    Alert.alert(
      'Cancel order',
      'Cancel this order? The admin will be notified to reassign or contact the customer.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order', style: 'destructive', onPress: async () => {
            setActionBusy(prev => ({ ...prev, [orderId]: 'cancel' }));
            try {
              await shopApi.rejectOrder(orderId);
              setActiveOrders(prev => prev.filter(o => o.id !== orderId));
            } catch (err) {
              Alert.alert('Could not cancel order', err?.message || 'Please try again.');
            } finally {
              setActionBusy(prev => {
                const next = { ...prev };
                delete next[orderId];
                return next;
              });
            }
          },
        },
      ]
    );
  }, []);

  const handleReadyOrder = useCallback(async (orderId) => {
    setActionBusy(prev => ({ ...prev, [orderId]: 'ready' }));
    try {
      await shopApi.readyOrder(orderId);
      setActiveOrders(prev => prev.map(o => (o.id === orderId ? { ...o, ready: true } : o)));
    } catch (err) {
      Alert.alert('Could not mark ready', err?.message || 'Please try again.');
    } finally {
      setActionBusy(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  }, []);

  // ── Shop toggle ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (value) => {
    const prev = isOpen;
    setIsOpen(value); // optimistic
    setToggleBusy(true);
    try {
      await shopApi.toggleShop(value);
    } catch (err) {
      setIsOpen(prev); // rollback
      Alert.alert('Could not update shop', err?.message || 'Please try again.');
    } finally {
      setToggleBusy(false);
    }
  }, [isOpen]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Sign out of the shop dashboard?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  const renderActiveOrder = ({ item }) => (
    <View style={styles.activeCard}>
      <View style={styles.activeAccent} />
      <View style={styles.activeCardBody}>
        <View style={styles.activeCardHeader}>
          <Text style={styles.activeOrderNumber}>#{item.orderNumber || item.order_number}</Text>
          <View style={styles.activeBadge}>
            <AppIcon name="check" size={12} color={colors.successDark} />
            <Text style={styles.activeBadgeText}>Preparing</Text>
          </View>
        </View>
        <View style={styles.activeElapsedRow}>
          <AppIcon name="clock" size={13} color={colors.textSecondary} />
          <Text style={styles.activeElapsedText}>
            {formatElapsed(item.createdAt || item.created_at, now)}
          </Text>
        </View>
        {(item.items || []).map((it, idx) => (
          <View key={idx} style={styles.activeItemRow}>
            <View style={styles.qtyChip}>
              <Text style={styles.qtyChipText}>{it.quantity}x</Text>
            </View>
            <Text style={styles.activeItemText}>
              {it.productName || it.product_name}
            </Text>
          </View>
        ))}

        {item.ready ? (
          <View style={styles.readyPill}>
            <AppIcon name="check" size={13} color={colors.info} />
            <Text style={styles.readyPillText}>Ready for pickup</Text>
          </View>
        ) : null}

        <View style={styles.activeActionsRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancelOrder(item.id)}
            disabled={!!actionBusy[item.id]}
            activeOpacity={0.85}
          >
            {actionBusy[item.id] === 'cancel' ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel</Text>
            )}
          </TouchableOpacity>
          {!item.ready && (
            <TouchableOpacity
              style={styles.readyBtn}
              onPress={() => handleReadyOrder(item.id)}
              disabled={!!actionBusy[item.id]}
              activeOpacity={0.85}
            >
              {actionBusy[item.id] === 'ready' ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.readyBtnText}>Ready</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{shop?.name || 'My Shop'}</Text>
          <Text style={styles.subtitle}>Shop owner dashboard</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.8}>
          <AppIcon name="logout" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Hero open/closed card */}
      <LinearGradient
        colors={[colors.brandGradientStart, colors.brandGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.heroStatusRow}>
              <Animated.View
                style={[
                  styles.liveDot,
                  { opacity: isOpen ? pulse : 0.45, backgroundColor: isOpen ? colors.success100 : 'rgba(255,255,255,0.8)' },
                ]}
              />
              <Text style={styles.heroStatus}>{isOpen ? 'Open' : 'Closed'}</Text>
            </View>
            <Text style={styles.heroSub}>
              {isOpen ? 'Taking new orders now' : 'Not accepting orders right now'}
            </Text>
          </View>
          <ShopToggle
            value={isOpen}
            onValueChange={handleToggle}
            activeColor={colors.success}
            disabled={toggleBusy}
            size="lg"
          />
        </View>
      </LinearGradient>

      {/* Metric strip */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { flex: 1 }]}>
          <AppIcon name="orders" size={22} color={colors.saffron} />
          <Text style={styles.metricValue}>{activeOrders.length}</Text>
          <Text style={styles.metricLabel}>Active orders</Text>
        </View>
        <View style={[styles.metricCard, { flex: 1 }]}>
          <AppIcon name="home" size={22} color={isOpen ? colors.success : colors.textTertiary} />
          <Text style={[styles.metricValue, { color: isOpen ? colors.successDark : colors.textTertiary }]}>
            {isOpen ? 'On' : 'Off'}
          </Text>
          <Text style={styles.metricLabel}>Shop status</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active orders</Text>
        {activeOrders.length > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{activeOrders.length}</Text>
          </View>
        )}
      </View>

      {loading && activeOrders.length === 0 ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
      ) : activeOrders.length === 0 ? (
        <FlatList
          data={[]}
          keyExtractor={() => 'empty'}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <AppIcon name="orders" size={32} color={colors.saffronDark} />
              </View>
              <Text style={styles.emptyTitle}>{loadError ? 'Could not load orders' : 'No active orders'}</Text>
              <Text style={styles.emptyText}>
                {loadError ? 'Pull down to try again.' : 'New orders appear here the moment a customer checks out.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={activeOrders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderActiveOrder}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        />
      )}

      <NewOrderPopup
        order={currentPopupOrder}
        onAccept={handleAccept}
        onReject={handleReject}
        queueIndex={0}
        queueTotal={pendingQueue.length}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.display, fontSize: 26, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  logoutBtn: {
    width: 42, height: 42, borderRadius: radius.circle, backgroundColor: colors.bgSurface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
    ...shadows.xs,
  },
  heroCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.md,
    borderRadius: radius.xxl, padding: spacing.xl, ...shadows.cardRaised,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center' },
  liveDot: {
    width: 12, height: 12, borderRadius: radius.circle, marginRight: spacing.sm,
    backgroundColor: colors.success100,
  },
  heroStatus: { color: colors.textInverse, fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 15, marginTop: 4, fontWeight: '500' },
  metricsRow: {
    flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.bgSurface, borderRadius: radius.xl, paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', ...shadows.sm,
  },
  metricValue: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, lineHeight: 34, marginTop: spacing.xs },
  metricLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600', letterSpacing: 0.2 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.labelSmall, fontSize: 13, color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countPill: {
    marginLeft: spacing.sm, backgroundColor: colors.saffronLight, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 2, minWidth: 24, alignItems: 'center',
  },
  countPillText: { color: colors.saffronDark, fontWeight: '800', fontSize: 12 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  activeCard: {
    flexDirection: 'row', backgroundColor: colors.bgSurface, borderRadius: radius.xl,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    ...shadows.sm,
  },
  activeAccent: {
    width: 6, backgroundColor: colors.saffron,
  },
  activeCardBody: { flex: 1, padding: spacing.md },
  activeCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm,
  },
  activeOrderNumber: { ...typography.h3, color: colors.textPrimary },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successLight, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  activeBadgeText: { color: colors.successDark, fontWeight: '700', fontSize: 12 },
  activeElapsedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.xs },
  activeElapsedText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  activeItemRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  qtyChip: {
    backgroundColor: colors.saffronLight, borderRadius: radius.sm, paddingHorizontal: 8,
    paddingVertical: 2, marginRight: spacing.sm, minWidth: 36, alignItems: 'center',
  },
  qtyChipText: { color: colors.saffronDark, fontWeight: '800', fontSize: 13 },
  activeItemText: { flex: 1, ...typography.body, color: colors.textSecondary, fontWeight: '500' },
  readyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: colors.infoLight, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: spacing.sm,
  },
  readyPillText: { color: colors.info, fontWeight: '800', fontSize: 12 },
  activeActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelBtn: {
    flex: 1, borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.error,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.errorLight,
  },
  cancelBtnText: { color: colors.error, fontWeight: '800', fontSize: 14 },
  readyBtn: {
    flex: 1, borderRadius: radius.button, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success,
  },
  readyBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: radius.circle, backgroundColor: colors.saffronLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  emptyText: {
    ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs,
    lineHeight: 20, maxWidth: 260,
  },
});
