import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, spacing, typography, radius } from '../../theme';
import { adminApi, subscribeAdminOrderEvents, subscribeAdminRealtimeLifecycle } from '../../api';
import AppIcon from '../../components/AppIcon';
import {
  getRealtimeOrderId,
  isRecentRealtimeEvent,
  mergeAdminOrderPatch,
} from '../../utils/realtimeOrder';
import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  getOrderStatusLabel,
  getOrderStatusColors,
  getPaymentStatusColors,
} from '../../utils/adminOrderStatus';

const EMPTY_FILTERS = {
  status: '', paymentStatus: '', paymentMethod: '', search: '', dateFrom: '', dateTo: '',
};

function formatMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(0) : '0';
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const QUICK_FILTERS = [
  { value: '', label: 'All' },
  ...ORDER_STATUS_OPTIONS,
];

/**
 * AdminOrdersScreen (ADMIN TASK 9) — full-parity list with apps/admin
 * Orders.jsx: all filters (status/search/paymentStatus/paymentMethod/date
 * range), pagination, live socket merge, pull-to-refresh.
 */
export default function AdminOrdersScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);

  const filtersRef = useRef(filters);
  const paginationRef = useRef(pagination);
  const recentRealtimeEvents = useRef({});

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { paginationRef.current = pagination; }, [pagination]);

  const fetchOrders = useCallback(async (page = 1, { silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const params = { page, limit: 20, ...filtersRef.current };
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);
      const res = await adminApi.listOrders(params);
      setOrders(res?.data || []);
      if (res?.pagination) setPagination(res.pagination);
    } catch (err) {
      setError(err?.message || 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(1, { silent: true }); }, [fetchOrders]));

  // Debounce filter changes (typing in search) same as web (300ms).
  useEffect(() => {
    const t = setTimeout(() => fetchOrders(1), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    const unsubOrders = subscribeAdminOrderEvents(({ eventName, payload }) => {
      const key = `${eventName}:${getRealtimeOrderId(payload)}:${payload.status || ''}:${payload.paymentStatus || payload.payment_status || ''}`;
      if (isRecentRealtimeEvent(recentRealtimeEvents, key)) return;

      const page = paginationRef.current.page || 1;
      const activeFilters = filtersRef.current;

      if (eventName === 'admin.order.created') {
        fetchOrders(Object.values(activeFilters).some(Boolean) ? page : 1, { silent: true });
        return;
      }

      const eventOrderId = getRealtimeOrderId(payload);
      if (!eventOrderId) return;

      setOrders((prev) => {
        let found = false;
        const patched = prev.map((order) => {
          if (String(order.id) !== eventOrderId) return order;
          found = true;
          return mergeAdminOrderPatch(order, payload);
        });
        if (!found) fetchOrders(page, { silent: true });
        return patched;
      });

      if (activeFilters.status || activeFilters.paymentStatus) {
        fetchOrders(page, { silent: true });
      }
    });

    const unsubLifecycle = subscribeAdminRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') {
        fetchOrders(paginationRef.current.page || 1, { silent: true });
      }
    });

    return () => {
      unsubOrders();
      unsubLifecycle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders(paginationRef.current.page || 1, { silent: true });
  }, [fetchOrders]);

  const openFilterSheet = () => {
    setDraftFilters(filters);
    setFilterSheetOpen(true);
  };
  const applyFilterSheet = () => {
    setFilters(draftFilters);
    setFilterSheetOpen(false);
  };
  const clearFilterSheet = () => {
    setDraftFilters(EMPTY_FILTERS);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const renderOrder = ({ item }) => {
    const statusColors = getOrderStatusColors(item.status);
    const paymentColors = getPaymentStatusColors(item.payment_status);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('AdminOrderDetail', { orderId: item.id })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNumber}>#{item.order_number}</Text>
          <Text style={styles.rowMeta}>{item.customer_name} · {item.phone}</Text>
          <Text style={styles.rowDate}>{formatDateTime(item.created_at)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.rowAmount}>₹{formatMoney(item.total)}</Text>
          <View style={[styles.pill, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.pillText, { color: statusColors.text }]}>{getOrderStatusLabel(item.status)}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: paymentColors.bg, marginTop: 4 }]}>
            <Text style={[styles.pillText, { color: paymentColors.text }]}>{item.payment_status}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <TouchableOpacity style={styles.filterBtn} onPress={openFilterSheet} activeOpacity={0.8}>
          <AppIcon name="settings" size={16} color={colors.textPrimary} />
          <Text style={styles.filterBtnText}>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <AppIcon name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search order #, name, phone"
          placeholderTextColor={colors.textTertiary}
          value={filters.search}
          onChangeText={(v) => setFilters((prev) => ({ ...prev, search: v }))}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        {QUICK_FILTERS.map((opt) => {
          const active = filters.status === opt.value;
          return (
            <TouchableOpacity
              key={opt.value || 'all'}
              testID={`quick-filter-${opt.value || 'all'}`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilters((prev) => ({ ...prev, status: opt.value }))}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderOrder}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No orders found.</Text>
            </View>
          )
        }
        ListFooterComponent={
          orders.length > 0 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, pagination.page <= 1 && styles.pageBtnDisabled]}
                disabled={pagination.page <= 1 || loading}
                onPress={() => fetchOrders(pagination.page - 1)}
              >
                <Text style={styles.pageBtnText}>Previous</Text>
              </TouchableOpacity>
              <Text style={styles.pageLabel}>Page {pagination.page} of {pagination.totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, pagination.page >= pagination.totalPages && styles.pageBtnDisabled]}
                disabled={pagination.page >= pagination.totalPages || loading}
                onPress={() => fetchOrders(pagination.page + 1)}
              >
                <Text style={styles.pageBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      <Modal visible={filterSheetOpen} transparent animationType="slide" onRequestClose={() => setFilterSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setFilterSheetOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Filters</Text>

            <Text style={styles.fieldLabel}>Payment status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.md }}>
              {['', ...PAYMENT_STATUS_OPTIONS].map((v) => (
                <TouchableOpacity
                  key={v || 'all'}
                  style={[styles.chip, draftFilters.paymentStatus === v && styles.chipActive]}
                  onPress={() => setDraftFilters((prev) => ({ ...prev, paymentStatus: v }))}
                >
                  <Text style={[styles.chipText, draftFilters.paymentStatus === v && styles.chipTextActive]}>{v || 'All'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Payment method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.md }}>
              {['', 'Cash', 'UPI'].map((v) => (
                <TouchableOpacity
                  key={v || 'all'}
                  style={[styles.chip, draftFilters.paymentMethod === v && styles.chipActive]}
                  onPress={() => setDraftFilters((prev) => ({ ...prev, paymentMethod: v }))}
                >
                  <Text style={[styles.chipText, draftFilters.paymentMethod === v && styles.chipTextActive]}>{v || 'All'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Date from (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="2026-07-01"
              placeholderTextColor={colors.textTertiary}
              value={draftFilters.dateFrom}
              onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v }))}
            />
            <Text style={styles.fieldLabel}>Date to (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="2026-07-31"
              placeholderTextColor={colors.textTertiary}
              value={draftFilters.dateTo}
              onChangeText={(v) => setDraftFilters((prev) => ({ ...prev, dateTo: v }))}
            />

            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetClearBtn} onPress={clearFilterSheet}>
                <Text style={styles.sheetClearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyBtn} onPress={applyFilterSheet}>
                <Text style={styles.sheetApplyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgSurface,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  filterBtnText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.textPrimary, fontSize: 14 },
  chipsRow: { flexGrow: 0, marginBottom: spacing.sm },
  chip: {
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse },
  errorBanner: {
    marginHorizontal: spacing.lg, backgroundColor: colors.errorLight, borderRadius: radius.lg,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  listContent: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.bgSurface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  orderNumber: { ...typography.body, fontWeight: '800', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowDate: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  rowAmount: { ...typography.body, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  emptyState: { alignItems: 'center', paddingTop: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginTop: spacing.md,
  },
  pageBtn: { backgroundColor: colors.bgSurface, borderRadius: radius.button, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontWeight: '700', color: colors.textPrimary, fontSize: 13 },
  pageLabel: { fontSize: 12, color: colors.textSecondary },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlayDark },
  sheet: {
    backgroundColor: colors.bgSurface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    padding: spacing.lg, paddingBottom: spacing.xl,
  },
  sheetTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, textTransform: 'uppercase' },
  dateInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md,
    paddingVertical: 10, marginBottom: spacing.md, color: colors.textPrimary,
  },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  sheetClearBtn: {
    flex: 1, borderRadius: radius.button, paddingVertical: spacing.sm, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border,
  },
  sheetClearBtnText: { fontWeight: '800', color: colors.textSecondary },
  sheetApplyBtn: { flex: 1, borderRadius: radius.button, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.saffron },
  sheetApplyBtnText: { fontWeight: '800', color: colors.textInverse },
});
