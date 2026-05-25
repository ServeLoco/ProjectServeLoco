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
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  Button,
  AppIcon,
  SkeletonRow,
  ProductImage,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { ordersApi } from '../../../api';
import { asArray, normalizeOrder } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FILTER_CHIPS = ['All', 'Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
const STATUS_CODE_LABELS = {
  0: 'Pending',
  1: 'Preparing',
  2: 'Out for Delivery',
  3: 'Delivered',
  4: 'Cancelled',
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
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  // Animations
  const listOpacity = useRef(new Animated.Value(1)).current;

  const fetchOrders = () => {
    setIsLoading(true);
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
      .finally(() => setIsLoading(false));
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

  const FadeInItem = ({ children, index, status }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const highlightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: index * 100, // Stagger based on index
        useNativeDriver: true,
      }).start();
    }, [anim, index]);

    useEffect(() => {
      if (status === 'Cancelled') {
        Animated.sequence([
          Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
          Animated.timing(highlightAnim, { toValue: 0, duration: 600, useNativeDriver: false })
        ]).start();
      }
    }, [status, highlightAnim]);

    const highlightColor = highlightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.bgSurface, colors.error + '1A']
    });

    return (
      <Animated.View
        style={{
          opacity: anim,
          transform: [{
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0]
            })
          }],
          backgroundColor: highlightColor,
          borderRadius: radius.md,
        }}
      >
        {children}
      </Animated.View>
    );
  };

  const getStatusColor = (status) => {
    switch(formatStatus(status)) {
      case 'Delivered': return colors.success;
      case 'Cancelled': return colors.error;
      case 'Pending':
      case 'Preparing': return colors.primary;
      case 'Out for Delivery': return colors.warning || '#F59E0B';
      default: return colors.textSecondary;
    }
  };

  const renderItem = ({ item, index }) => {
    const statusLabel = formatStatus(item.status);
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
              {statusLabel}
            </Text>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <View style={styles.previewWrap}>
            <ProductImage uri={item.previewImg} width={56} height={56} borderRadius={radius.md} style={styles.previewImg} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.itemCount}>{item.itemCount} Item{item.itemCount > 1 ? 's' : ''}</Text>
            <Text style={styles.paymentMethod} numberOfLines={1}>{item.paymentMethod} payment</Text>
          </View>
          <View style={styles.amountBlock}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalAmount}>Rs. {item.total}</Text>
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
          : `You don't have any ${activeFilter.toLowerCase()} orders.`}
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
              key={chip}
              style={[styles.chip, activeFilter === chip && styles.chipActive]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setActiveFilter(chip);
              }}
            >
              <Text style={[styles.chipText, activeFilter === chip && styles.chipTextActive]}>{chip}</Text>
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
    gap: spacing.sm,
  },
  previewWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImg: {
    backgroundColor: colors.bgInput,
  },
  cardDetails: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  itemCount: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  paymentMethod: {
    ...typography.caption,
    color: colors.textSecondary,
    marginVertical: 2,
  },
  amountBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 76,
  },
  totalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    marginBottom: 2,
  },
  totalAmount: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '900',
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
