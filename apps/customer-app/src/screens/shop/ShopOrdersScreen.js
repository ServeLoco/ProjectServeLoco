import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography } from '../../theme';
import { shopApi, subscribeRealtime } from '../../api';

/**
 * ShopOrdersScreen
 * Lists orders with this shop's items (status Accepted/Preparing, server-filtered).
 * Polls on focus AND subscribes to the `shop.order.assigned` socket event to refetch.
 * Each card shows the shop's items + a Confirm button (or Confirmed state).
 */
export default function ShopOrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await shopApi.getMyOrders();
      if (mountedRef.current) setOrders(res.orders || []);
    } catch (_) {
      // keep last list on transient error
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Poll on focus.
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  // Subscribe to the shop.order.assigned socket event → refetch.
  useEffect(() => {
    const unsubscribe = subscribeRealtime('shop.order.assigned', () => {
      fetchOrders();
    });
    return unsubscribe;
  }, [fetchOrders]);

  const handleConfirm = useCallback(async (orderId) => {
    setConfirmingId(orderId);
    try {
      await shopApi.confirmOrder(orderId);
      // Mark this order's items as confirmed locally (idempotent server-side).
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, confirmed: true } : o))
      );
    } catch (_) {
      // leave as-is; the user can retry
    } finally {
      setConfirmingId(null);
    }
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.orderNumber}>#{item.orderNumber || item.order_number}</Text>
        <View style={[styles.statusBadge, item.status === 'Accepted' ? styles.badgeAccepted : styles.badgePreparing]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      {(item.items || []).map((it, idx) => (
        <Text key={idx} style={styles.itemText}>
          {it.quantity}x {it.productName || it.product_name}
          {it.variantLabel || it.variant_label ? ` (${it.variantLabel || it.variant_label})` : ''}
        </Text>
      ))}

      {item.confirmed ? (
        <View style={styles.confirmedBadge}>
          <Text style={styles.confirmedText}>Confirmed ✓</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={() => handleConfirm(item.id)}
          disabled={confirmingId === item.id}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmBtnText}>
            {confirmingId === item.id ? 'Confirming…' : 'Confirm'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Orders</Text>
      {loading && orders.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          ListEmptyComponent={<Text style={styles.empty}>No orders to prepare right now.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  title: { ...typography.heading, fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNumber: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeAccepted: { backgroundColor: 'rgba(31,181,116,0.12)' },
  badgePreparing: { backgroundColor: 'rgba(244,166,42,0.15)' },
  statusText: { fontSize: 12, fontWeight: '600' },
  itemText: { fontSize: 15, color: colors.textSecondary, marginTop: 4 },
  confirmBtn: { marginTop: 12, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirmBtnText: { color: colors.textInverse, fontWeight: '700', fontSize: 15 },
  confirmedBadge: { marginTop: 12, backgroundColor: 'rgba(31,181,116,0.12)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  confirmedText: { color: colors.success, fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40, fontSize: 15 },
});
