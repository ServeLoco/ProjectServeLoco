/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  RefreshControl,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  Button,
  AppIcon,
  SkeletonRow,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { ordersApi } from '../../../api';
import { asArray, normalizeOrder } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FILTER_CHIPS = [
  { label: 'All', value: 'All' },
  { label: 'Order Placed', value: 'Pending' },
  { label: 'Accepted', value: 'Accepted' },
  { label: 'Preparing/Packing', value: 'Preparing' },
  { label: 'Out for Delivery', value: 'Out for Delivery' },
  { label: 'Delivered', value: 'Delivered' },
  { label: 'Cancelled', value: 'Cancelled' },
];
const STATUS_CODE_LABELS = {
  0: 'Pending',
  1: 'Accepted',
  2: 'Preparing',
  3: 'Out for Delivery',
  4: 'Delivered',
  5: 'Cancelled',
};
const STATUS_DISPLAY_LABELS = {
  Pending: 'Order Placed',
  Accepted: 'Accepted',
  Preparing: 'Preparing/Packing',
};

const formatStatus = (status) => {
  if (status === null || status === undefined || status === '') return 'Pending';
  const raw = String(status).trim();
  if (/^\d+$/.test(raw)) return STATUS_CODE_LABELS[raw] || 'Pending';
  return raw.replace(/_/g, ' ');
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function OrdersScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [activeFilter, setActiveFilter] = useState('All');
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  // Animations
  const listOpacity = useRef(new Animated.Value(1)).current;

  const fetchOrders = (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setIsError(false);

    ordersApi.getOrders()
      .then(response => {
      let filtered = asArray(response, ['orders']).map(normalizeOrder);
      if (activeFilter !== 'All') {
        filtered = filtered.filter(o => formatStatus(o.status) === activeFilter);
      }

      // Crossfade
      Animated.sequence([
        Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
        Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();

      setOrders(filtered);
      })
      .catch((err) => {
        setIsError(true);
        setErrorMessage(err?.response?.data?.message || err?.message || 'There was a problem fetching your order history.');
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  };

  const handleRefresh = () => {
    fetchOrders(true);
  };

  useEffect(() => {
    if (isFocused) {
      fetchOrders();
    }
  }, [activeFilter, isFocused]); // Re-fetch on focus or filter change

  const handleCancelOrder = (orderId) => {
    setCancellingId(orderId);
    ordersApi.cancelOrder(orderId)
      .then(response => {
        const cancelled = normalizeOrder(response?.order || response?.data || response || {});
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          ...cancelled,
          id: o.id,
          status: cancelled.status || 'Cancelled',
          canCancel: false,
        } : o));
      })
      .catch(() => setIsError(true))
      .finally(() => setCancellingId(null));
  };

// Defined outside OrdersScreen so hooks are stable across renders.
// Mixing useNativeDriver:true (opacity/transform) with useNativeDriver:false
// (backgroundColor) on the SAME Animated.View crashes React Native.
// Fix: use two separate layers — a plain View for the JS-driven background color,
// and an inner Animated.View for native opacity/transform.
const FadeInItem = ({ children, index, status }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const normalizedStatus = String(status || '').trim().toLowerCase();
  const isInProcess = normalizedStatus !== 'delivered' && normalizedStatus !== 'cancelled';

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay: index * 100,
      useNativeDriver: true,  // safe: only drives opacity + translateY
    }).start();
  // index and anim are stable refs — run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === 'Cancelled') {
      highlightAnim.stopAnimation();
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();
    }
  }, [status, highlightAnim]);

  useEffect(() => {
    let loop;
    if (isInProcess) {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      );
      loop.start();
    } else {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isInProcess, glowAnim]);

  const highlightColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.bgSurface, colors.error + '1A'],
  });

  // Outer Animated.View handles ONLY JS-driven backgroundColor (useNativeDriver:false).
  // Inner Animated.View handles ONLY native opacity + translateY (useNativeDriver:true).
  // Mixing both on a single node is what caused the crash.
  return (
    <Animated.View
      style={{
        backgroundColor: highlightColor,  // JS driver
        borderRadius: radius.md,
      }}
    >
      <Animated.View
        style={{
          opacity: anim,                   // native driver
          transform: [{
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          }],
        }}
      >
        <View style={{ position: 'relative' }}>
          {children}
          {isInProcess && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glowBorder,
                {
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.15, 0.65],
                  }),
                },
              ]}
            />
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
};


  const getStatusColor = (status) => {
    switch(formatStatus(status)) {
      case 'Delivered': return colors.success;
      case 'Cancelled': return colors.error;
      case 'Accepted':
      case 'Pending':
      case 'Preparing': return colors.primary;
      case 'Out for Delivery': return colors.warning || '#F59E0B';
      default: return colors.textSecondary;
    }
  };

  const renderItem = ({ item, index }) => {
    const statusLabel = formatStatus(item.status);
    const displayStatus = STATUS_DISPLAY_LABELS[statusLabel] || statusLabel;
    const orderLabel = item.orderNumber || item.order_number || item.id;

    return (
    <FadeInItem index={index} status={statusLabel}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.orderTitleBlock}>
            <Text style={styles.orderId} numberOfLines={1}>Order #{orderLabel}</Text>
            <Text style={styles.orderDate}>{formatDate(item.date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(statusLabel) + '1A' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(statusLabel) }]} numberOfLines={1}>
              {displayStatus}
            </Text>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <View style={styles.cardDetails}>
            <View style={styles.infoBadgeRow}>
              <View style={styles.infoBadge}>
                <AppIcon name="orders" size={13} color={colors.textSecondary} />
                <Text style={styles.infoBadgeText}>{item.itemCount} Item{item.itemCount > 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.infoBadge}>
                <AppIcon name="creditCard" size={13} color={colors.textSecondary} />
                <Text style={styles.infoBadgeText} numberOfLines={1}>{item.paymentMethod}</Text>
              </View>
            </View>
          </View>
          <View style={styles.amountBlock}>
            <Text style={styles.totalLabel} numberOfLines={1}>TOTAL</Text>
            <Text style={styles.totalAmount} numberOfLines={1}>Rs. {item.total}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardActions}>
          {item.canCancel && (
            <Button 
              label={cancellingId === item.id ? "Cancelling..." : "Cancel Order"} 
              variant="outline" 
              size="small" 
              onPress={() => handleCancelOrder(item.id)}
              disabled={cancellingId === item.id}
              style={styles.cancelBtn}
            />
          )}
          <View style={{ flex: 1 }} />
          <Button 
            label="View Details" 
            size="small" 
            onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
          />
        </View>
      </View>
    </FadeInItem>
  );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((k) => (
        <View key={k} style={styles.card}>
          <SkeletonRow />
          <View style={{ height: spacing.lg }} />
          <SkeletonRow />
        </View>
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <AppIcon name="orders" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
      <Text style={styles.emptyTitle}>No orders found</Text>
      <Text style={styles.emptyDesc}>
        {activeFilter === 'All' 
          ? "You haven't placed any orders yet. Start exploring our delicious menu!"
          : `You don't have any ${(STATUS_DISPLAY_LABELS[activeFilter] || activeFilter).toLowerCase()} orders.`}
      </Text>
      <Button 
        label="Start Shopping" 
        onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })} 
      />
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <AppIcon name="close" size={48} color={colors.error} style={styles.emptyEmoji} />
      <Text style={styles.emptyTitle}>Could not load orders</Text>
      <Text style={styles.emptyDesc}>{errorMessage}</Text>
      <Button label="Retry" onPress={() => fetchOrders()} />
    </View>
  );

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="My Orders" />

      {/* Filter Chips */}
      <View style={styles.filterArea}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTER_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip.value}
              style={[styles.chip, activeFilter === chip.value && styles.chipActive]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setActiveFilter(chip.value);
              }}
            >
              <Text style={[styles.chipText, activeFilter === chip.value && styles.chipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.listContainer}>
        {isLoading ? (
          renderSkeleton()
        ) : isError ? (
          renderErrorState()
        ) : orders.length === 0 ? (
          renderEmptyState()
        ) : (
          <Animated.FlatList
            data={orders}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
            style={{ opacity: listOpacity }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary, colors.success, colors.saffron]}
                title="Refreshing ServeLoco"
                titleColor={colors.textSecondary}
              />
            }
          />
        )}
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  filterArea: {
    backgroundColor: colors.bgSurface,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  flatListContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  skeletonContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  orderTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '900',
    marginBottom: 2,
  },
  orderDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusBadge: {
    maxWidth: 140,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  statusText: {
    ...typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.2,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardDetails: {
    flex: 1,
    minWidth: 0,
  },
  infoBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.md,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoBadgeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  amountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 90,
    flexShrink: 0,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  totalAmount: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelBtn: {
    borderColor: colors.error,
  },
  glowBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: radius.lg + 2,
    borderWidth: 2,
    borderColor: '#FFEA00',
    ...shadows.md,
    shadowColor: '#FFEA00',
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
});
