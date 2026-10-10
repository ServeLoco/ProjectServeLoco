import { adminUi } from '../../theme/adminUi';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, spacing, typography, radius } from '../../theme';
import { adminApi, subscribeAdminOrderEvents, subscribeAdminRealtimeLifecycle } from '../../api';
import AppIcon from '../../components/AppIcon';
import AdminNotificationBell from '../../components/admin/AdminNotificationBell';
import { useAuthStore } from '../../stores';

function formatMoney(n) {
  const v = Number(n) || 0;
  return `₹${v.toFixed(0)}`;
}

function formatWhen(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function ReportsLink({ onPress }) {
  return (
    <TouchableOpacity
      style={styles.reportsLink}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open reports"
    >
      <View style={styles.reportsIcon}><AppIcon name="analytics" size={22} color={colors.saffronDark} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.reportsTitle}>Reports</Text>
        <Text style={styles.subtitle}>Sales, shop payouts and food ratings</Text>
      </View>
      <View style={styles.reportsAction}>
        <Text style={styles.sectionLink}>View</Text>
        <AppIcon name="chevronRight" size={16} color={colors.saffronDark} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * AdminDashboardScreen (ADMIN TASK 8) — KPI strip, Delivery Available toggle,
 * read-only Shop Status, and a Latest Orders list. Mirrors apps/admin
 * Dashboard.jsx behavior: shop_open is server-derived, never toggled here.
 */
export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const logout = useAuthStore((s) => s.logout);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [togglingDelivery, setTogglingDelivery] = useState(false);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log out?',
      'You will need OTP again to open Admin Mode on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => logout() },
      ]
    );
  }, [logout]);

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setError(false);
      const res = await adminApi.getDashboard();
      setData(res?.data || null);
      setError(false);
    } catch (_) {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchDashboard(); }, [fetchDashboard]));

  // Soft refresh on live order activity or reconnect — matches web Dashboard's
  // queueDashboardRefresh behavior (ADMIN TASK 8.5).
  useEffect(() => {
    const unsubOrders = subscribeAdminOrderEvents(() => fetchDashboard({ silent: true }));
    const unsubLifecycle = subscribeAdminRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') fetchDashboard({ silent: true });
    });
    return () => {
      unsubOrders();
      unsubLifecycle();
    };
  }, [fetchDashboard]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard({ silent: true });
  }, [fetchDashboard]);

  const applyDeliveryToggle = useCallback(async (nextValue) => {
    setTogglingDelivery(true);
    try {
      await adminApi.updateSettings({ delivery_available: nextValue });
      await fetchDashboard({ silent: true });
    } catch (err) {
      Alert.alert('Could not update delivery', err?.message || 'Please try again.');
    } finally {
      setTogglingDelivery(false);
    }
  }, [fetchDashboard]);

  const handleToggleDelivery = useCallback(() => {
    if (!data) return;
    const nextValue = !data.delivery_available;
    // Turning delivery OFF is a big, easy-to-mis-tap action on a phone —
    // confirm before applying (ADMIN TASK 8.2; web has no confirm since a
    // mouse click is more deliberate than a touchscreen tap).
    if (!nextValue) {
      Alert.alert(
        'Turn delivery off?',
        'Customers will not be able to place new orders until you turn this back on.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn off', style: 'destructive', onPress: () => applyDeliveryToggle(false) },
        ]
      );
      return;
    }
    applyDeliveryToggle(true);
  }, [data, applyDeliveryToggle]);

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ReportsLink onPress={() => navigation.navigate('AdminReports')} />
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ReportsLink onPress={() => navigation.navigate('AdminReports')} />
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <AppIcon name="warning" size={32} color={colors.saffronDark} />
          </View>
          <Text style={styles.emptyTitle}>Could not load dashboard</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchDashboard()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sales = data?.sales || {};
  const latestOrders = data?.latest_orders || [];
  const deliveryAvailable = Boolean(data?.delivery_available);
  const shopOpen = Boolean(data?.shop_open);

  const renderOrder = ({ item }) => (
    <TouchableOpacity
      style={styles.orderRow}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('AdminOrderDetail', { orderId: item.id })}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.orderNumber}>#{item.order_number || item.orderNumber || item.id}</Text>
        <Text style={styles.orderMeta}>{item.customer_name || item.customerName || 'Customer'} · {formatWhen(item.created_at || item.createdAt)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.orderAmount}>{formatMoney(item.total)}</Text>
        <Text style={styles.orderStatus}>{item.status}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={latestOrders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderOrder}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerTextCol}>
                <Text style={styles.title}>Dashboard</Text>
                <Text style={styles.subtitle}>Ops overview</Text>
              </View>
              <View style={styles.headerActions}>
                <AdminNotificationBell />
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={handleLogout}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Log out"
                >
                  <Text style={styles.logoutBtnText}>Log out</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ReportsLink onPress={() => navigation.navigate('AdminReports')} />

            <View style={styles.statusRow}>
              <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>DELIVERY AVAILABLE</Text>
                <TouchableOpacity
                  style={[styles.statusToggle, deliveryAvailable ? styles.statusOn : styles.statusOff]}
                  onPress={handleToggleDelivery}
                  disabled={togglingDelivery}
                  activeOpacity={0.85}
                >
                  {togglingDelivery ? (
                    <ActivityIndicator size="small" color={deliveryAvailable ? colors.successDark : colors.textSecondary} />
                  ) : (
                    <Text style={[styles.statusToggleText, deliveryAvailable ? styles.statusOnText : styles.statusOffText]}>
                      {deliveryAvailable ? 'Available' : 'Off'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>SHOP STATUS</Text>
                <View style={[styles.statusPill, shopOpen ? styles.statusOn : styles.statusOff]}>
                  <Text style={[styles.statusToggleText, shopOpen ? styles.statusOnText : styles.statusOffText]}>
                    {shopOpen ? 'Open' : 'Closed'}
                  </Text>
                </View>
                <Text style={styles.statusAuto}>Auto</Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <AppIcon name="rupee" size={18} color={colors.saffronDark} />
                <Text style={styles.metricValue}>{formatMoney(sales.todaySales)}</Text>
                <Text style={styles.metricLabel}>Today's sales</Text>
              </View>
              <View style={styles.metricCard}>
                <AppIcon name="orders" size={18} color={colors.info} />
                <Text style={styles.metricValue}>{sales.todayOrders || 0}</Text>
                <Text style={styles.metricLabel}>Today's orders</Text>
              </View>
              <View style={styles.metricCard}>
                <AppIcon name="clock" size={18} color={colors.saffronDark} />
                <Text style={styles.metricValue}>{sales.pendingOrders || 0}</Text>
                <Text style={styles.metricLabel}>Pending orders</Text>
              </View>
              <View style={styles.metricCard}>
                <AppIcon name="creditCard" size={18} color={colors.info} />
                <Text style={styles.metricValue}>{formatMoney(sales.pendingPaymentTotal)}</Text>
                <Text style={styles.metricLabel}>Pending payments</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Latest orders</Text>
              <TouchableOpacity onPress={() => navigation.navigate('AdminOrders')}>
                <Text style={styles.sectionLink}>View all</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No orders yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminUi.canvas },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: adminUi.gutter, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.md,
  },
  headerTextCol: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.display, fontSize: 24, color: adminUi.text },
  subtitle: { ...typography.bodySmall, color: adminUi.muted, marginTop: 2, fontWeight: '500' },
  logoutBtn: {
    marginTop: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: adminUi.border, backgroundColor: colors.bgSurface,
  },
  logoutBtnText: { fontWeight: '700', fontSize: 13, color: adminUi.muted },
  reportsLink: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: adminUi.gutter, marginBottom: spacing.md, padding: spacing.md,
    backgroundColor: colors.bgSurface, borderRadius: adminUi.cardRadius,
    borderWidth: 1, borderColor: adminUi.border,
  },
  reportsTitle: { ...typography.h3, color: adminUi.text },
  reportsIcon: {
    width: 42, height: 42, borderRadius: adminUi.controlRadius,
    backgroundColor: colors.saffronLight, alignItems: 'center', justifyContent: 'center',
  },
  reportsAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statusRow: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: adminUi.gutter, marginBottom: spacing.md,
  },
  statusCard: {
    flex: 1, minWidth: 0, backgroundColor: colors.bgSurface, borderRadius: adminUi.cardRadius, padding: spacing.md,
    borderWidth: 1, borderColor: adminUi.border, ...adminUi.shadow,
  },
  statusLabel: {
    fontSize: 10, fontWeight: '700', color: adminUi.muted, letterSpacing: 0.3,
    marginBottom: spacing.xs,
  },
  statusToggle: {
    alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8,
    minHeight: 34, justifyContent: 'center',
  },
  statusPill: {
    alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8,
    minHeight: 34, justifyContent: 'center',
  },
  statusOn: { backgroundColor: colors.successLight },
  statusOff: { backgroundColor: adminUi.canvas },
  statusToggleText: { fontWeight: '800', fontSize: 13 },
  statusOnText: { color: colors.successDark },
  statusOffText: { color: adminUi.muted },
  statusAuto: { fontSize: 10, fontWeight: '700', color: adminUi.hint, marginTop: 4, letterSpacing: 0.4 },
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: adminUi.gutter,
    marginBottom: spacing.lg, justifyContent: 'space-between', rowGap: spacing.sm,
  },
  metricCard: {
    width: '48%', backgroundColor: colors.bgSurface, borderRadius: adminUi.cardRadius,
    padding: 14, borderWidth: 1, borderColor: adminUi.border,
    alignItems: 'flex-start', justifyContent: 'center', gap: 6, minHeight: 110, ...adminUi.shadow,
  },
  metricValue: { fontSize: 24, fontWeight: '800', color: adminUi.text, fontVariant: ['tabular-nums'] },
  metricLabel: {
    fontSize: 12, color: adminUi.muted, fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: adminUi.gutter, marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.labelSmall, fontSize: 13, color: adminUi.muted, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  sectionLink: { color: colors.saffronDark, fontWeight: '700', fontSize: 13, paddingVertical: 4 },
  listContent: { paddingBottom: spacing.xl },
  orderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    backgroundColor: colors.bgSurface, borderRadius: adminUi.cardRadius, borderWidth: 1, borderColor: adminUi.border,
    padding: spacing.md, marginHorizontal: adminUi.gutter, marginBottom: spacing.sm,
  },
  orderNumber: { ...typography.body, fontWeight: '700', color: adminUi.text },
  orderMeta: { fontSize: 12, color: adminUi.muted, marginTop: 2 },
  orderAmount: { ...typography.body, fontWeight: '800', color: adminUi.text },
  orderStatus: {
    fontSize: 11, color: adminUi.muted, marginTop: 2, textTransform: 'uppercase',
    fontWeight: '700', textAlign: 'right',
  },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: radius.circle, backgroundColor: colors.saffronLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: adminUi.text },
  emptyText: { ...typography.body, color: adminUi.muted },
  retryBtn: {
    marginTop: spacing.md, backgroundColor: colors.saffron, borderRadius: radius.button,
    paddingHorizontal: adminUi.gutter, paddingVertical: spacing.sm,
  },
  retryBtnText: { color: colors.textInverse, fontWeight: '800' },
});
