/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
  SkeletonRow,
  ProductImage,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore } from '../../../stores';
import { ordersApi } from '../../../api';
import { asArray, normalizeOrder } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FILTER_CHIPS = ['All', 'Pending', 'Preparing', 'Delivered', 'Cancelled'];

export default function OrdersScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);

  const [activeFilter, setActiveFilter] = useState('All');
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
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
        filtered = filtered.filter(o => o.status === activeFilter);
      }

      // Crossfade
      Animated.sequence([
        Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
        Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();

      setOrders(filtered);
      })
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isFocused && isAuthenticated) {
      fetchOrders();
    }
  }, [activeFilter, isFocused, isAuthenticated]); // Re-fetch on focus or filter change

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
    switch(status) {
      case 'Delivered': return colors.success;
      case 'Cancelled': return colors.error;
      case 'Pending':
      case 'Preparing': return colors.primary;
      default: return colors.textSecondary;
    }
  };

  const renderItem = ({ item, index }) => (
    <FadeInItem index={index} status={item.status}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderId}>{item.id}</Text>
            <Text style={styles.orderDate}>{item.date}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '1A' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <ProductImage uri={item.previewImg} width={56} height={56} borderRadius={radius.md} style={styles.previewImg} />
          <View style={styles.cardDetails}>
            <Text style={styles.itemCount}>{item.itemCount} Item{item.itemCount > 1 ? 's' : ''}</Text>
            <Text style={styles.paymentMethod}>Payment: {item.paymentMethod}</Text>
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
      <Text style={styles.emptyEmoji}>Box</Text>
      <Text style={styles.emptyTitle}>No orders found</Text>
      <Text style={styles.emptyDesc}>You haven't placed any orders yet. Start exploring our delicious menu!</Text>
      <Button 
        label="Start Shopping" 
        onPress={() => navigation.navigate('Home')} 
      />
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>!</Text>
      <Text style={styles.emptyTitle}>Could not load orders</Text>
      <Text style={styles.emptyDesc}>There was a problem fetching your order history.</Text>
      <Button label="Retry" onPress={() => fetchOrders()} />
    </View>
  );

  if (!isAuthenticated) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="My Orders" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>Lock</Text>
          <Text style={styles.emptyTitle}>Login Required</Text>
          <Text style={styles.emptyDesc}>Please login to view your order history.</Text>
          <Button label="Login / Signup" onPress={() => navigation.navigate('Auth')} />
        </View>
      </AppScreen>
    );
  }

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
    backgroundColor: 'transparent',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  orderId: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 2,
  },
  orderDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '700',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  previewImg: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgDisabled,
    marginRight: spacing.md,
  },
  cardDetails: {
    flex: 1,
    justifyContent: 'center',
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
  totalAmount: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
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
