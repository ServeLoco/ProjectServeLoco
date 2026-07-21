import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { shopApi, subscribeRealtime } from '../../api';
import AppIcon from '../../components/AppIcon';

// Visual treatment per order status, using the app's existing color tokens.
const STATUS_STYLE = {
  Pending: { bg: colors.warningLight, text: colors.warning, dot: colors.warning },
  Accepted: { bg: colors.saffronLight, text: colors.saffronDark, dot: colors.saffron },
  Preparing: { bg: colors.saffronLight, text: colors.saffronDark, dot: colors.saffron },
  'Out for Delivery': { bg: colors.infoLight, text: colors.info, dot: colors.info },
  Delivered: { bg: colors.successLight, text: colors.successDark, dot: colors.success },
  Cancelled: { bg: colors.errorLight, text: colors.error, dot: colors.error },
};

/**
 * ShopOrdersScreen
 * Full order history for this shop — every order it has ever had items on,
 * any status, most recent first (server caps at 100 rows). The live
 * Dashboard tab shows Accepted/Preparing; this is the "all orders received"
 * view, redesigned to match the premium partner app aesthetic.
 */
export default function ShopOrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await shopApi.getOrderHistory();
      setOrders(res.orders || []);
      setLoadError(false);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
  }, [fetchHistory]);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  useEffect(() => {
    const unsubAssigned = subscribeRealtime('shop.order.assigned', () => fetchHistory());
    const unsubCancelled = subscribeRealtime('shop.order.cancelled', () => fetchHistory());
    const unsubUpdated = subscribeRealtime('shop.order.updated', () => fetchHistory());
    const unsubForeground = subscribeRealtime('lifecycle.foreground', () => fetchHistory());
    const unsubReconnected = subscribeRealtime('lifecycle.reconnected', () => fetchHistory());
    return () => {
      unsubAssigned();
      unsubCancelled();
      unsubUpdated();
      unsubForeground();
      unsubReconnected();
    };
  }, [fetchHistory]);

  const summary = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter(o => o.status === 'Delivered').length;
    const cancelled = orders.filter(o => o.status === 'Cancelled').length;
    const active = orders.filter(o => o.status === 'Pending' || o.status === 'Accepted' || o.status === 'Preparing' || o.status === 'Out for Delivery').length;
    return { total, delivered, cancelled, active };
  }, [orders]);

  const renderOrder = ({ item }) => {
    const statusStyle = STATUS_STYLE[item.status] || { bg: colors.bgSurface, text: colors.textSecondary, dot: colors.textTertiary };
    return (
      <View style={styles.card}>
        <View style={[styles.cardAccent, { backgroundColor: statusStyle.dot }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderNumber}>#{item.orderNumber || item.order_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusStyle.dot }]} />
              <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
            </View>
          </View>
          {(item.items || []).map((it, idx) => (
            <View key={idx} style={styles.itemRow}>
              <View style={styles.qtyChip}>
                <Text style={styles.qtyChipText}>{it.quantity}x</Text>
              </View>
              <Text style={styles.itemText}>
                {it.productName || it.product_name}
              </Text>
            </View>
          ))}
          {item.rejected && (
            <View style={styles.rejectedNote}>
              <AppIcon name="close" size={12} color={colors.error} />
              <Text style={styles.rejectedNoteText}>You rejected this order</Text>
            </View>
          )}
          {item.adminRemark ? (
            <View style={styles.remarkNote}>
              <AppIcon name="pencil" size={12} color={colors.textSecondary} />
              <Text style={styles.remarkNoteText}>{item.adminRemark}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>Every order your shop has received</Text>
      </View>

      {orders.length > 0 && (
        <View style={styles.summaryRow}>
          <SummaryPill label="Total" value={summary.total} color={colors.textPrimary} />
          <SummaryPill label="Active" value={summary.active} color={colors.saffron} />
          <SummaryPill label="Delivered" value={summary.delivered} color={colors.success} />
          <SummaryPill label="Cancelled" value={summary.cancelled} color={colors.error} />
        </View>
      )}

      {loading && orders.length === 0 ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
      ) : orders.length === 0 ? (
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
              <Text style={styles.emptyTitle}>{loadError ? 'Could not load orders' : 'No orders yet'}</Text>
              <Text style={styles.emptyText}>
                {loadError ? 'Pull down to try again.' : 'Every order your shop has received will show up here.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderOrder}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        />
      )}
    </SafeAreaView>
  );
}

function SummaryPill({ label, value, color }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.display, fontSize: 26, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  summaryRow: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  summaryPill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgSurface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm,
    ...shadows.xs,
  },
  summaryValue: { ...typography.priceLarge, fontSize: 22, fontWeight: '800' },
  summaryLabel: { ...typography.captionMedium, color: colors.textSecondary, marginTop: 2 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: {
    flexDirection: 'row', backgroundColor: colors.bgSurface, borderRadius: radius.xl,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    ...shadows.sm,
  },
  cardAccent: {
    width: 6, backgroundColor: colors.saffron,
  },
  cardBody: { flex: 1, padding: spacing.md },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm,
  },
  orderNumber: { ...typography.h3, color: colors.textPrimary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: radius.circle },
  statusText: { fontWeight: '800', fontSize: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  qtyChip: {
    backgroundColor: colors.saffronLight, borderRadius: radius.sm, paddingHorizontal: 8,
    paddingVertical: 2, marginRight: spacing.sm, minWidth: 36, alignItems: 'center',
  },
  qtyChipText: { color: colors.saffronDark, fontWeight: '800', fontSize: 13 },
  itemText: { flex: 1, ...typography.body, color: colors.textSecondary, fontWeight: '500' },
  rejectedNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  rejectedNoteText: { color: colors.error, fontSize: 12, fontWeight: '700' },
  remarkNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  remarkNoteText: { flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: '600', lineHeight: 16 },
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
