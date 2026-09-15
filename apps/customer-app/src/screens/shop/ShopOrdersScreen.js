import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { colors, spacing, typography, radius, glass, glassRadius, glassShadow } from '../../theme';
import { shopApi, subscribeRealtime } from '../../api';
import AppIcon from '../../components/AppIcon';
import DayHistoryPicker from '../../components/DayHistoryPicker';
import { todayDateStr } from '../../utils/dateStr';

// Visual treatment per order status — translucent fills with a matching rim,
// which is what stays legible on the black canvas.
const STATUS_STYLE = {
  Pending: { bg: '#9A5B00', dot: '#FFD59E' },
  Accepted: { bg: '#C2560F', dot: '#FFC9A3' },
  Preparing: { bg: '#C2560F', dot: '#FFC9A3' },
  'Out for Delivery': { bg: '#2563EB', dot: '#BFD4FF' },
  Delivered: { bg: '#128A55', dot: '#9EF0C8' },
  Cancelled: { bg: '#B3211F', dot: '#FFB3B1' },
};

/**
 * ShopOrdersScreen
 * Full order history for this shop — every order it has ever had items on,
 * any status, most recent first (server caps at 100 rows). The live
 * Dashboard tab shows Accepted/Preparing; this is the "all orders received"
 * view, redesigned to match the premium partner app aesthetic.
 */
export default function ShopOrdersScreen() {
  // Scoped to focus: the screen stays mounted behind the other tabs.
  const isScreenFocused = useIsFocused();
  const [orders, setOrders] = useState([]);
  // What VillKro owes this shop for the orders currently shown (excludes
  // rejected items and cancelled orders — see getMyOrderHistory on the API).
  const [payableTotal, setPayableTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Default view is today only; picking a day from history browses that day.
  const [selectedDate, setSelectedDate] = useState(() => todayDateStr());
  const [pickerVisible, setPickerVisible] = useState(false);
  const isToday = selectedDate === todayDateStr();

  // Kept in a ref (not just state) so fetchHistory can read the latest
  // selected date without selectedDate being in its dependency array — if it
  // were, fetchHistory's identity would change on every date pick, which
  // would re-trigger useFocusEffect below and double-fetch.
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  // Guards against out-of-order responses: if the user picks day A then day
  // B before A's request resolves, A's (now-stale) response must not
  // overwrite B's.
  const requestIdRef = useRef(0);

  const fetchHistory = useCallback(async (date) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const res = await shopApi.getOrderHistory({ date: date || selectedDateRef.current });
      if (requestIdRef.current !== requestId) return; // superseded by a newer request
      setOrders(res.orders || []);
      setPayableTotal(res.payableTotal || res.payable_total || 0);
      setLoadError(false);
    } catch (_) {
      if (requestIdRef.current !== requestId) return;
      // Deliberately keep the previous `orders`/`payableTotal` on screen —
      // but loadError still flips so the UI can flag them as possibly stale
      // instead of silently presenting old numbers as current.
      setLoadError(true);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
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
    // Realtime pushes only matter for "today" — a past day being browsed in
    // history mode doesn't change from a live order event.
    if (!isToday) return undefined;
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
  }, [fetchHistory, isToday]);

  const handleSelectDate = useCallback((dateStr) => {
    setSelectedDate(dateStr);
    setPickerVisible(false);
    setLoading(true);
    fetchHistory(dateStr);
  }, [fetchHistory]);

  const backToToday = useCallback(() => {
    const t = todayDateStr();
    setSelectedDate(t);
    setLoading(true);
    fetchHistory(t);
  }, [fetchHistory]);

  const summary = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter(o => o.status === 'Delivered').length;
    const cancelled = orders.filter(o => o.status === 'Cancelled').length;
    const active = orders.filter(o => o.status === 'Pending' || o.status === 'Accepted' || o.status === 'Preparing' || o.status === 'Out for Delivery').length;
    return { total, delivered, cancelled, active };
  }, [orders]);

  const renderOrder = ({ item }) => {
    const statusStyle = STATUS_STYLE[item.status] || { bg: '#3A3A42', dot: '#FFFFFF' };
    return (
      <View style={styles.card}>
        <View style={[styles.cardAccent, { backgroundColor: statusStyle.bg }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderNumber} numberOfLines={1} ellipsizeMode="tail">#{item.orderNumber || item.order_number}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {(item.deliveryType || item.delivery_type) ? (
                <View style={[
                  styles.speedBadge,
                  (item.deliveryType || item.delivery_type) === 'fast' ? styles.speedBadgeFast : styles.speedBadgeStandard,
                ]}>
                  <Text style={[
                    styles.speedBadgeText,
                    (item.deliveryType || item.delivery_type) === 'fast' ? styles.speedBadgeTextFast : styles.speedBadgeTextStandard,
                  ]}>
                    {(item.deliveryType || item.delivery_type) === 'fast' ? '⚡ Express' : 'Standard'}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: statusStyle.dot }]} />
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
          </View>
          {(item.items || []).map((it, idx) => {
            const shopLineTotal = it.shopLineTotal ?? it.shop_line_total;
            return (
              <View key={it.id ?? idx} style={styles.itemRow}>
                <View style={styles.qtyChip}>
                  <Text style={styles.qtyChipText}>{it.quantity}x</Text>
                </View>
                <Text style={styles.itemText}>
                  {it.productName || it.product_name}
                </Text>
                {shopLineTotal !== null && shopLineTotal !== undefined ? (
                  <Text style={styles.itemAmount}>₹{shopLineTotal}</Text>
                ) : (
                  <Text style={styles.itemAmountUnset}>price not set</Text>
                )}
              </View>
            );
          })}
          {(item.shopTotal ?? item.shop_total) > 0 && (
            <View style={styles.cardTotalRow}>
              <Text style={styles.cardTotalLabel}>
                {item.status === 'Delivered' ? 'You received' : "You'll receive (pending delivery)"}
              </Text>
              <Text style={styles.cardTotalValue}>₹{item.shopTotal ?? item.shop_total}</Text>
            </View>
          )}
          {item.rejected && (
            <View style={styles.rejectedNote}>
              <AppIcon name="close" size={12} color={glass.errorText} />
              <Text style={styles.rejectedNoteText}>You rejected this order</Text>
            </View>
          )}
          {item.status === 'Cancelled' && !item.rejected && (
            <View style={styles.rejectedNote}>
              <AppIcon name="close" size={12} color={glass.errorText} />
              <Text style={styles.rejectedNoteText}>Order cancelled — not payable</Text>
            </View>
          )}
          {item.adminRemark ? (
            <View style={styles.remarkNote}>
              <AppIcon name="pencil" size={12} color={glass.textDim} />
              <Text style={styles.remarkNoteText}>{item.adminRemark}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {isScreenFocused && <StatusBar barStyle="light-content" backgroundColor="transparent" />}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={styles.title}>Orders</Text>
            <Text style={styles.subtitle}>
              {isToday ? "Today's orders" : `Orders on ${selectedDate}`}
            </Text>
          </View>
          {isToday ? (
            <TouchableOpacity style={styles.historyBtn} onPress={() => setPickerVisible(true)}>
              <AppIcon name="orders" size={14} color={colors.textInverse} />
              <Text style={styles.historyBtnText}>History</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.historyBtn} onPress={backToToday}>
              <Text style={styles.historyBtnText}>← Today</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loadError && orders.length > 0 && (
        <View style={styles.staleBanner}>
          <AppIcon name="close" size={12} color={glass.errorText} />
          <Text style={styles.staleBannerText}>Could not refresh — numbers below may be out of date. Pull down to retry.</Text>
        </View>
      )}

      {orders.length > 0 && (
        <View style={styles.summaryRow}>
          <SummaryPill label="Total" value={summary.total} color={glass.text} />
          <SummaryPill label="Active" value={summary.active} color={colors.saffron} />
          <SummaryPill label="Delivered" value={summary.delivered} color={colors.success} />
          <SummaryPill label="Cancelled" value={summary.cancelled} color={glass.errorText} />
        </View>
      )}

      {orders.length > 0 && (
        <View style={styles.payablePill}>
          <AppIcon name="rupee" size={14} color={glass.successText} />
          <Text style={styles.payablePillText}>
            {isToday ? "Today's payout" : 'Payout for this day'}: <Text style={styles.payablePillValue}>₹{payableTotal}</Text>
          </Text>
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
            <LinearGradient
              colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.emptyState}
            >
              <View style={styles.emptyTopLight} pointerEvents="none" />
              <View style={styles.emptyIconWrap}>
                <AppIcon name="orders" size={32} color="#FFFFFF" />
              </View>
              <Text style={styles.emptyTitle}>{loadError ? 'Could not load orders' : 'No orders yet'}</Text>
              <Text style={styles.emptyText}>
                {loadError ? 'Pull down to try again.' : 'Every order your shop has received will show up here.'}
              </Text>
            </LinearGradient>
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

      <DayHistoryPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelectDate={handleSelectDate}
        selectedDate={selectedDate}
        variant="dark"
      />
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
  container: { flex: 1, backgroundColor: glass.screen },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.display, fontSize: 26, color: glass.text },
  subtitle: { ...typography.bodySmall, color: glass.textDim, marginTop: 2, fontWeight: '500' },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.saffron, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  historyBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 13 },

  speedBadge: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  speedBadgeFast: { backgroundColor: colors.saffron },
  speedBadgeStandard: { backgroundColor: '#2563EB' },
  speedBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  speedBadgeTextFast: { color: '#FFFFFF' },
  speedBadgeTextStandard: { color: '#FFFFFF' },

  summaryRow: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  summaryPill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3A3A42', borderRadius: glassRadius.inner,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingVertical: spacing.sm + 2,
    ...glassShadow,
  },
  summaryValue: { ...typography.priceLarge, fontSize: 22, fontWeight: '800' },
  summaryLabel: { ...typography.captionMedium, color: 'rgba(255,255,255,0.70)', marginTop: 2 },

  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl + spacing.xxl },
  card: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.26)', borderRadius: glassRadius.card,
    marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', overflow: 'hidden',
    ...glassShadow,
  },
  cardAccent: { width: 6, backgroundColor: colors.saffron },
  cardBody: { flex: 1, padding: spacing.md + 2 },
  cardHeader: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm, rowGap: 6,
  },
  orderNumber: { ...typography.h3, color: glass.text, flexShrink: 1, marginRight: spacing.sm },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: radius.circle },
  statusText: { fontWeight: '800', fontSize: 12, color: '#FFFFFF' },

  itemRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  qtyChip: {
    backgroundColor: colors.saffron, borderRadius: radius.lg, paddingHorizontal: 8,
    paddingVertical: 3, marginRight: spacing.sm, minWidth: 38, alignItems: 'center',
  },
  qtyChipText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  itemText: { flex: 1, ...typography.body, color: glass.text, fontWeight: '500' },
  itemAmount: { ...typography.captionMedium, color: glass.text, fontWeight: '800' },
  itemAmountUnset: { ...typography.captionMedium, color: glass.textFaint, fontStyle: 'italic' },

  cardTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm, marginHorizontal: -(spacing.md + 2), marginBottom: -(spacing.md + 2),
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2,
    backgroundColor: '#0C6B43',
  },
  cardTotalLabel: { ...typography.captionMedium, color: '#FFFFFF', fontWeight: '700' },
  cardTotalValue: { ...typography.label, color: '#FFFFFF', fontWeight: '900' },

  payablePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#0C6B43', borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  payablePillText: { ...typography.captionMedium, color: '#FFFFFF', fontWeight: '700' },
  payablePillValue: { fontWeight: '800' },

  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#B3211F', borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  staleBannerText: { ...typography.captionMedium, color: '#FFFFFF', fontWeight: '700', flexShrink: 1 },

  rejectedNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: glass.divider,
  },
  rejectedNoteText: { color: glass.errorText, fontSize: 12, fontWeight: '700' },
  remarkNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: glass.divider,
  },
  remarkNoteText: { flex: 1, color: glass.textDim, fontSize: 12, fontWeight: '600', lineHeight: 16 },

  emptyState: {
    alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl,
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    borderRadius: glassRadius.card, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderTopColor: 'rgba(255,255,255,0.25)',
    borderLeftColor: 'rgba(255,255,255,0.16)',
    ...glassShadow,
  },
  emptyTopLight: {
    position: 'absolute', top: 0, left: 26, right: 26, height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 1,
  },
  emptyIconWrap: {
    width: 76, height: 76, borderRadius: radius.circle, backgroundColor: '#FF7A3A',
    borderWidth: 1, borderColor: '#E05A1A',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: glass.text },
  emptyText: {
    ...typography.body, color: glass.textDim, textAlign: 'center', marginTop: spacing.xs,
    lineHeight: 20, maxWidth: 260,
  },
});
