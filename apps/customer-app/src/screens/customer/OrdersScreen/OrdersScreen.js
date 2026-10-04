/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  Button,
  AppIcon,
  SkeletonRow,
  EmptyState,
  ErrorState,
  DayHistoryPicker,
} from '../../../components';
import { colors, typography, spacing, radius, shadows, layout } from '../../../theme';
import { ordersApi, subscribeOrderEvents, subscribeRealtimeLifecycle } from '../../../api';
import { asArray, normalizeOrder } from '../../../utils';
import { todayDateStr } from '../../../utils/dateStr';
import {
  getRealtimeOrderId,
  getRealtimeOrderKey,
  isRecentRealtimeEvent,
  mergeOrderRealtimePatch,
} from '../../../utils/realtimeOrder';

// Two tabs: orders still in progress, and finished ones. Cancelled orders
// sit with Delivered so a cancel never makes an order vanish from the page.
const ORDER_TABS = [
  { label: 'Live orders', value: 'Live' },
  { label: 'Delivered', value: 'Delivered' },
];
const DONE_STATUSES = ['Delivered', 'Cancelled'];
// Item lines shown on a card before folding the rest into "+N more".
const MAX_PREVIEW_ITEMS = 3;
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
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getCancelledOrderPatch = (response) => {
  const responseOrder = response?.order || response?.data;
  if (!responseOrder || responseOrder.success) {
    return { status: 'Cancelled' };
  }

  return normalizeOrder(responseOrder);
};

const getCancelledPaymentStatus = (paymentMethod) => (
  paymentMethod === 'UPI' ? 'Refunded' : 'Failed'
);

// Per-status visual tokens. Kept in one map so the status pill / icon /
// stepper / Details button all stay in sync.
const STATUS_VISUALS = {
  Pending: {
    color: '#0E1116',
    colorAlt: '#374151',
    bg: '#F3F4F6',
    iconBg: '#E5E7EB',
    icon: 'orders',
    step: 0,
  },
  Accepted: {
    color: '#1D4ED8',
    colorAlt: '#3B82F6',
    bg: '#EFF6FF',
    iconBg: '#DBEAFE',
    icon: 'check',
    step: 1,
  },
  Preparing: {
    color: '#C2410C',
    colorAlt: '#FF7A3A',
    bg: '#FFF2EB',
    iconBg: '#FFE0CC',
    icon: 'box',
    step: 2,
  },
  'Out for Delivery': {
    color: '#B45309',
    colorAlt: '#F59E0B',
    bg: '#FFFBEB',
    iconBg: '#FEF3C7',
    icon: 'navigation',
    step: 3,
  },
  Delivered: {
    color: '#065F46',
    colorAlt: '#1FB574',
    bg: '#EAFDF5',
    iconBg: '#C6F4DF',
    icon: 'check',
    step: 4,
  },
  Cancelled: {
    color: '#9B1C1C',
    colorAlt: '#E5484D',
    bg: '#FFF0F0',
    iconBg: '#FCA5A5',
    icon: 'close',
    step: -1,
  },
};

const getStatusVisual = (statusLabel) => STATUS_VISUALS[statusLabel] || {
  color: colors.textSecondary,
  colorAlt: colors.textTertiary,
  bg: colors.bgApp,
  iconBg: colors.bgApp,
  icon: 'orders',
  step: 0,
};

// Order lifecycle steps for the progress stepper
const ORDER_STEPS = [
  { label: 'Placed', icon: 'orders' },
  { label: 'Accepted', icon: 'check' },
  { label: 'Packing', icon: 'box' },
  { label: 'On way', icon: 'navigation' },
  { label: 'Done', icon: 'check' },
];

// Defined at module scope so its hook identities and component reference are
// stable across OrdersScreen renders. Previously this lived inside the parent
// function and forced every card to unmount/remount on each parent render.
//
// Mixing useNativeDriver:true (opacity/transform) with useNativeDriver:false
// (backgroundColor) on the SAME Animated.View crashes React Native, so the
// JS-driven backgroundColor lives on the outer Animated.View and the native
// opacity/transform on an inner Animated.View.
const FadeInItem = ({ children, index, status, glowColor = colors.primary }) => {
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
      useNativeDriver: true,
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

  return (
    <Animated.View
      style={{
        backgroundColor: highlightColor,
        borderRadius: radius.xl,
      }}
    >
      <Animated.View
        style={{
          opacity: anim,
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
                  borderColor: glowColor,
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.2, 0.7],
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

export default function OrdersScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [activeFilter, setActiveFilter] = useState('Live');
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, hasMore: true, total: 0 });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Default view is today only; picking a day from history browses that day.
  const [selectedDate, setSelectedDate] = useState(() => todayDateStr());
  const [pickerVisible, setPickerVisible] = useState(false);
  const isToday = selectedDate === todayDateStr();

  // Animations
  const listOpacity = useRef(new Animated.Value(1)).current;
  const realtimeFetchTimer = useRef(null);
  const recentRealtimeEvents = useRef({});
  // Set when the screen is opened (or another day is picked): the next fetch
  // then picks the tab — Live if any order is still in progress, else
  // Delivered. Realtime refreshes and the user's own tab taps don't re-pick.
  const autoPickTab = useRef(true);

  const fetchOrders = useCallback((refresh = false) => {
    const isLoadMore = !refresh && pagination.offset > 0;
    if (refresh) {
      setIsRefreshing(true);
    } else if (isLoadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setIsError(false);

    const offset = refresh ? 0 : pagination.offset;

    ordersApi.getOrders({ limit: pagination.limit, offset, date: selectedDate })
      .then(response => {
        const meta = response?.meta || { total: 0, limit: 20, offset: 0, hasMore: false };
        // Store the RAW page — the Live/Delivered tab filter is applied at render
        // time (displayOrders below). Filtering here would bake the filter
        // that was active at fetch time into the paginated list, so pages
        // fetched under different tabs would mix and tab taps would do
        // nothing until the next fetch.
        const fetched = asArray(response, ['orders']).map(normalizeOrder);

        Animated.sequence([
          Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
          Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true })
        ]).start();

        setPagination({
          limit: meta.limit,
          offset: meta.offset + fetched.length,
          hasMore: meta.hasMore,
          total: meta.total,
        });

        setOrders(prev => (refresh ? fetched : [...prev, ...fetched]));

        if (refresh && autoPickTab.current) {
          autoPickTab.current = false;
          const hasLive = fetched.some(o => !DONE_STATUSES.includes(formatStatus(o.status)));
          setActiveFilter(hasLive ? 'Live' : 'Delivered');
        }
      })
      .catch((err) => {
        setIsError(true);
        setErrorMessage(err?.response?.data?.message || err?.message || 'There was a problem fetching your order history.');
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      });
  }, [listOpacity, pagination.limit, pagination.offset, selectedDate]);

  // Keep a ref to the latest fetchOrders so the realtime subscription can call
  // the most recent version without depending on pagination state. Without
  // this, every pagination update would tear down and recreate the realtime
  // subscription, which can drop realtime events during the resubscribe.
  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  const queueRealtimeRefresh = useCallback(() => {
    if (realtimeFetchTimer.current) {
      clearTimeout(realtimeFetchTimer.current);
    }

    realtimeFetchTimer.current = setTimeout(() => {
      if (isFocused) {
        fetchOrdersRef.current(true);
      }
    }, 350);
  }, [isFocused]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && pagination.hasMore && !isRefreshing && !isLoading) {
      fetchOrders(false);
    }
  }, [isLoadingMore, pagination.hasMore, isRefreshing, isLoading, fetchOrders]);

  const handleRefresh = () => {
    fetchOrders(true);
  };

  const handleSelectDate = useCallback((dateStr) => {
    setSelectedDate(dateStr);
    setPickerVisible(false);
  }, []);

  const backToToday = useCallback(() => {
    setSelectedDate(todayDateStr());
  }, []);

  useEffect(() => {
    if (isFocused) {
      autoPickTab.current = true;
      // Always a full refresh: fetchOrders(false) at offset > 0 is a
      // load-more and would silently APPEND the next page every time the
      // user tabs back to this screen. isLoading starts true, so the very
      // first focus still shows the skeleton rather than the pull spinner.
      fetchOrders(true);
    }
  }, [isFocused, selectedDate]); // Re-fetch on focus, or when browsing a different day

  useEffect(() => {
    const unsubscribeOrders = subscribeOrderEvents(({ eventName, payload }) => {
      const eventKey = getRealtimeOrderKey(eventName, payload);
      if (isRecentRealtimeEvent(recentRealtimeEvents, eventKey)) return;

      if (eventName === 'order.created') {
        queueRealtimeRefresh();
        return;
      }

      const eventOrderId = getRealtimeOrderId(payload);
      if (!eventOrderId) return;

      // The tab filter is applied at render time, so patching an order in
      // place moves it between tabs automatically. A refetch is only needed
      // when the order isn't in the loaded pages at all.
      let shouldRefresh = false;

      setOrders(prevOrders => {
        let found = false;
        const nextOrders = prevOrders.map(order => {
          if (String(order.id) !== eventOrderId) return order;
          found = true;
          return mergeOrderRealtimePatch(order, payload);
        });

        if (!found) {
          shouldRefresh = true;
        }

        return nextOrders;
      });

      if (shouldRefresh) {
        queueRealtimeRefresh();
      }
    });

    const unsubscribeLifecycle = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') {
        queueRealtimeRefresh();
      }
    });

    return () => {
      unsubscribeOrders();
      unsubscribeLifecycle();
      if (realtimeFetchTimer.current) {
        clearTimeout(realtimeFetchTimer.current);
      }
    };
  }, [queueRealtimeRefresh]);

  const handleCancelOrder = (orderId) => {
    setCancellingId(orderId);
    ordersApi.cancelOrder(orderId)
      .then(response => {
        const cancelled = getCancelledOrderPatch(response);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          ...cancelled,
          id: o.id,
          status: cancelled.status || 'Cancelled',
          paymentStatus: cancelled.paymentStatus || getCancelledPaymentStatus(o.paymentMethod),
          canCancel: false,
        } : o));
      })
      // Don't flip the full-screen error state for a single failed cancel —
      // that would wipe the entire orders list. Show an inline alert and keep
      // the list intact so the user can retry.
      .catch(err => {
        Alert.alert('Cancel failed', err?.message || 'Unable to cancel this order. Please try again.');
      })
      .finally(() => setCancellingId(null));
  };

  // Tab filtering happens here — over the raw paginated list — so tapping a
  // tab refilters the already-loaded pages instantly and load-more keeps
  // appending to one consistent list regardless of the active tab.
  const displayOrders = useMemo(() => (
    orders.filter((o) => {
      const isDone = DONE_STATUSES.includes(formatStatus(o.status));
      return activeFilter === 'Delivered' ? isDone : !isDone;
    })
  ), [orders, activeFilter]);

  const renderItem = ({ item, index }) => {
    const statusLabel = formatStatus(item.status);
    const displayStatus = STATUS_DISPLAY_LABELS[statusLabel] || statusLabel;
    const orderLabel = item.orderNumber || item.order_number || item.id;
    const previewItems = Array.isArray(item.items_preview) ? item.items_preview : [];
    const visual = getStatusVisual(statusLabel);
    const isCancelled = statusLabel === 'Cancelled';
    const activeStep = visual.step;

    return (
    <FadeInItem index={index} status={statusLabel} glowColor={visual.colorAlt}>
      <View style={styles.card}>

        {/* ── Header: order id + date, status pill ── */}
        <View style={styles.cardHeader}>
          <View style={styles.cardMeta}>
            <Text
              style={styles.orderId}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              #{orderLabel}
            </Text>
            <Text style={styles.orderDate} numberOfLines={1}>{formatDate(item.date)}</Text>
          </View>

          {/* Status pill */}
          <View style={[styles.statusPill, { backgroundColor: visual.bg, borderColor: visual.colorAlt + '40' }]}>
            <View style={[styles.statusPillDot, { backgroundColor: visual.colorAlt }]} />
            <Text style={[styles.statusPillText, { color: visual.color }]} numberOfLines={1}>
              {displayStatus}
            </Text>
          </View>
        </View>

        {/* ── Card Body ── */}
        <View style={styles.cardBody}>

          {/* Progress stepper (hidden for Cancelled) */}
          {!isCancelled && (
            <View style={styles.stepperRow}>
              {ORDER_STEPS.map((step, si) => {
                const isCompleted = si <= activeStep;
                const isActive = si === activeStep;
                return (
                  <React.Fragment key={step.label}>
                    <View style={styles.stepItem}>
                      <View style={[
                        styles.stepDot,
                        isCompleted ? { backgroundColor: visual.colorAlt } : styles.stepDotInactive,
                        isActive && styles.stepDotActive,
                      ]}>
                        {isCompleted && (
                          <AppIcon
                            name={isActive ? visual.icon : 'check'}
                            size={isActive ? 9 : 8}
                            color="#FFF"
                            strokeWidth={3}
                          />
                        )}
                      </View>
                      <Text style={[
                        styles.stepLabel,
                        isCompleted ? { color: visual.colorAlt, fontWeight: '700' } : {},
                        isActive ? { fontWeight: '800' } : {},
                      ]} numberOfLines={1}>
                        {step.label}
                      </Text>
                    </View>
                    {si < ORDER_STEPS.length - 1 && (
                      <View style={[
                        styles.stepLine,
                        si < activeStep ? { backgroundColor: visual.colorAlt } : {},
                      ]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* Cancelled banner */}
          {isCancelled && (
            <View style={styles.cancelledBanner}>
              <AppIcon name="close" size={13} color={colors.error} strokeWidth={2.8} />
              <Text style={styles.cancelledBannerText}>This order was cancelled</Text>
            </View>
          )}

          {/* Items in the order */}
          <View style={styles.itemsList}>
            {previewItems.slice(0, MAX_PREVIEW_ITEMS).map((it, ii) => (
              <Text key={`${it.name}-${ii}`} style={styles.itemLine} numberOfLines={1}>
                <Text style={styles.itemQty}>{it.quantity} × </Text>
                {it.name}{it.variant_label ? ` (${it.variant_label})` : ''}
              </Text>
            ))}
            {previewItems.length > MAX_PREVIEW_ITEMS && (
              <Text style={styles.itemMore}>+{previewItems.length - MAX_PREVIEW_ITEMS} more</Text>
            )}
            {previewItems.length === 0 && (
              <Text style={styles.itemLine}>
                {item.itemCount} Item{item.itemCount > 1 ? 's' : ''}
              </Text>
            )}
          </View>

          {/* Bottom row: price + actions */}
          <View style={styles.cardRowBottom}>
            <View>
              <Text style={styles.totalLabel}>Order Total</Text>
              <Text style={styles.totalAmount}>Rs. {item.total}</Text>
            </View>
            <View style={styles.actionsRow}>
              {item.canCancel && (
                <Button
                  label={cancellingId === item.id ? 'Cancelling…' : 'Cancel'}
                  variant="outline"
                  size="small"
                  onPress={() => handleCancelOrder(item.id)}
                  disabled={cancellingId === item.id}
                  style={styles.cancelBtn}
                />
              )}
              <TouchableOpacity
                onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
                style={[styles.detailsBtn, { backgroundColor: visual.color }]}
                activeOpacity={0.80}
                accessibilityRole="button"
                accessibilityLabel="View order details"
              >
                <Text style={styles.detailsBtnText}>Details</Text>
                <AppIcon name="chevronRight" size={13} color={'#FFF'} strokeWidth={2.8} />
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </FadeInItem>
  );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((k) => (
        <View key={k} style={styles.card}>
          <View style={styles.cardBody}>
            <View style={styles.cardRow}>
              <SkeletonRow style={{ width: '70%' }} />
            </View>
            <View style={{ height: 8 }} />
            <SkeletonRow style={{ width: '90%' }} />
            <View style={{ height: 8 }} />
            <SkeletonRow style={{ width: '40%' }} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <EmptyState
      icon={<AppIcon name="orders" size={56} color={colors.textTertiary} />}
      title={activeFilter === 'Live' ? 'No live orders' : 'No delivered orders'}
      subtitle={activeFilter === 'Live'
        ? "You don't have any orders on the way right now."
        : 'Your delivered and cancelled orders will show here.'}
      actionLabel="Start Shopping"
      onAction={() => navigation.navigate('MainTabs', { screen: 'Home' })}
      style={styles.emptyState}
    />
  );

  const renderErrorState = () => (
    <ErrorState
      icon={<AppIcon name="close" size={48} color={colors.error} />}
      title="Could not load orders"
      message={errorMessage}
      onRetry={() => fetchOrders()}
      style={styles.emptyState}
    />
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <AppScreen style={styles.container} bg={colors.bgSurface} safeAreaBottom={false}>
      <AppHeader title="My Orders" bordered />

      <View style={styles.dateRow}>
        <Text style={styles.dateRowText}>
          {isToday ? "Today's orders" : `Orders on ${selectedDate}`}
        </Text>
        {isToday ? (
          <TouchableOpacity style={styles.historyBtn} onPress={() => setPickerVisible(true)}>
            <AppIcon name="clock" size={14} color={colors.textPrimary} strokeWidth={2.4} />
            <Text style={styles.historyBtnText}>History</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.historyBtn} onPress={backToToday}>
            <Text style={styles.historyBtnText}>← Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live / Delivered tabs */}
      <View style={styles.tabsArea}>
        <View style={styles.tabsTrack}>
          {ORDER_TABS.map(tab => {
            const isActive = activeFilter === tab.value;
            return (
              <TouchableOpacity
                key={tab.value}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  autoPickTab.current = false;
                  setActiveFilter(tab.value);
                }}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
              >
                {tab.value === 'Live' && <View style={styles.liveDot} />}
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.listContainer}>
        {isLoading ? (
          renderSkeleton()
        ) : isError ? (
          renderErrorState()
        ) : displayOrders.length === 0 ? (
          renderEmptyState()
        ) : (
          <Animated.FlatList
            data={displayOrders}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.flatListContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            style={{ opacity: listOpacity }}
            // removeClippedSubviews + windowSize tuning — see ProductListScreen.
            removeClippedSubviews
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
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

      <DayHistoryPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelectDate={handleSelectDate}
        selectedDate={selectedDate}
      />
    </AppScreen>
  );
}

// Light grey used for card borders, dividers and the tab track — the page
// is plain white, so these carry the structure.
const LINE = '#ECEEF2';
const MUTED_BG = '#F5F6F8';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSurface,
  },

  /* ----- Date row (today / history) ----- */
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  dateRowText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.bgSurface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: LINE,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  historyBtnText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },

  /* ----- Live / Delivered tabs ----- */
  tabsArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  tabsTrack: {
    flexDirection: 'row',
    backgroundColor: MUTED_BG,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: STATUS_VISUALS.Delivered.colorAlt,
  },
  tabText: {
    ...typography.labelSmall,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.textInverse,
    fontWeight: '800',
  },

  /* ----- List ----- */
  listContainer: {
    flex: 1,
    backgroundColor: colors.bgSurface,
  },
  flatListContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: layout.bottomNavHeight + spacing.lg + 12,
  },

  /* ----- Skeleton ----- */
  skeletonContainer: {
    padding: spacing.md,
    gap: spacing.md,
  },

  /* ----- Card ----- */
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: LINE,
    overflow: 'hidden',
    ...shadows.sm,
  },

  /* Header */
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  orderDate: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 13,
  },

  /* Card body */
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.md,
    gap: 12,
  },

  /* Progress stepper */
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotInactive: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.grey100,
  },
  stepDotActive: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  stepLine: {
    flex: 1,
    height: 2.5,
    backgroundColor: LINE,
    borderRadius: 2,
    marginBottom: 14,
    marginHorizontal: 2,
  },

  /* Cancelled banner */
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  cancelledBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
    letterSpacing: 0.1,
  },

  /* Items in the order */
  itemsList: {
    gap: 3,
  },
  itemLine: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  itemQty: {
    fontWeight: '800',
    color: colors.textPrimary,
  },
  itemMore: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: colors.textTertiary,
  },

  /* Bottom row */
  cardRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  totalAmount: {
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  detailsBtnText: {
    fontWeight: '800',
    color: '#FFFFFF',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  glowBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: radius.xl + 2,
    borderWidth: 2,
    // No shadow/elevation here: on Android the shadow of this see-through
    // layer tints the whole white card with the status colour.
  },

  /* ----- Empty / error ----- */
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
});
