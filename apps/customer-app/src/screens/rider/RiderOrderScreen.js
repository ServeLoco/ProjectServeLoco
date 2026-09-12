import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { riderApi, subscribeRealtime } from '../../api';
import AppIcon from '../../components/AppIcon';
import RiderDeliveryMap from '../../components/RiderDeliveryMap';
import {
  getRiderActionFlags,
  mergeRiderOrder,
} from '../../utils/riderOrderActions';
import { elapsedSecondsFromStart, formatElapsed } from '../../utils/riderOfferTime';
import { openGoogleMapsDirections } from '../../utils/googleMapsNav';

/**
 * Full-screen delivery map + status actions for one assigned order.
 * Button visibility matches RiderDashboardScreen (shared getRiderActionFlags).
 */
export default function RiderOrderScreen({ route, navigation }) {
  const orderId = route.params?.orderId;
  // Snapshot from dashboard so first paint matches the card before fetch returns.
  const [order, setOrder] = useState(() => route.params?.order || null);
  const [loading, setLoading] = useState(!route.params?.order);
  const [actionBusy, setActionBusy] = useState(null);
  const [error, setError] = useState(null);
  // Actual rendered height of the bottom sheet (it grows/shrinks with its
  // content), so the map can pad its camera by exactly what's covered
  // instead of guessing.
  const [sheetHeight, setSheetHeight] = useState(0);

  const fetchOrder = useCallback(async ({ silent = false } = {}) => {
    if (!orderId) return;
    try {
      if (!silent) setError(null);
      const res = await riderApi.getAssignment(orderId);
      const next = res?.order || null;
      if (next) {
        setOrder((prev) => mergeRiderOrder(prev, next));
      } else {
        setOrder(null);
      }
    } catch (err) {
      if (!silent) {
        setError(err?.message || 'Could not load order');
        setOrder(null);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      // Always re-fetch on focus so map stays in sync with card actions.
      fetchOrder({ silent: true });
    }, [fetchOrder]),
  );

  // Live updates when this rider (or admin) changes assignment status.
  useEffect(() => {
    if (!orderId) return undefined;
    const unsub = subscribeRealtime('rider.assignment.updated', (payload) => {
      const eventOrderId = payload?.orderId ?? payload?.order_id;
      if (eventOrderId != null && String(eventOrderId) !== String(orderId)) return;
      if (payload?.order) {
        setOrder((prev) => mergeRiderOrder(prev, payload.order));
      } else {
        fetchOrder({ silent: true });
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [orderId, fetchOrder]);

  const runAction = useCallback(async (key, fn, { goBackOnSuccess = false } = {}) => {
    setActionBusy(key);
    try {
      const res = await fn();
      // Apply API order immediately so buttons hide without waiting for refetch.
      if (res?.order) {
        setOrder((prev) => mergeRiderOrder(prev, res.order));
      }
      if (goBackOnSuccess) {
        navigation.goBack();
        return;
      }
      await fetchOrder({ silent: true });
    } catch (err) {
      Alert.alert('Action failed', err?.message || 'Try again');
      await fetchOrder({ silent: true });
    } finally {
      setActionBusy(null);
    }
  }, [fetchOrder, navigation]);

  const handleOutForDelivery = () => {
    runAction('ofd', () => riderApi.updateStatus(orderId, 'Out for Delivery'));
  };

  const handleDelivered = () => {
    runAction('delivered', () => riderApi.updateStatus(orderId, 'Delivered'), { goBackOnSuccess: true });
  };

  const terminal = order ? getRiderActionFlags(order).terminal : true;
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!orderId || terminal) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [orderId, terminal]);

  if (loading && !order) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.saffron} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>{error || 'Order not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const flags = getRiderActionFlags(order);
  const phone = order?.phone;
  const pickedUp = flags.pickedUp;
  const assignedAt = order?.riderAssignedAt || order?.rider_assigned_at;
  const elapsedLabel = assignedAt
    ? formatElapsed(elapsedSecondsFromStart(assignedAt, nowTick))
    : null;

  const navShops = (Array.isArray(order?.shops) ? order.shops : [])
    .map((s) => {
      const lat = Number(s?.latitude ?? s?.lat);
      const lng = Number(s?.longitude ?? s?.lng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
    })
    .filter(Boolean);
  const custLat = Number(order?.latitude ?? order?.lat);
  const custLng = Number(order?.longitude ?? order?.lng);
  const navCustomer = Number.isFinite(custLat) && Number.isFinite(custLng)
    ? { latitude: custLat, longitude: custLng }
    : null;

  const handleNavigate = async () => {
    // Same staging as the in-app map: shop(s) first, customer only once
    // picked up (openGoogleMapsDirections omits origin, so Google Maps
    // tracks/recenters the rider's live location on its own).
    const args = pickedUp || navShops.length === 0
      ? { destination: navCustomer }
      : { destination: navShops[navShops.length - 1], waypoints: navShops.slice(0, -1) };
    const ok = await openGoogleMapsDirections(args);
    if (!ok) {
      Alert.alert('Could not open Google Maps', 'Make sure Google Maps (or a browser) is installed.');
    }
  };
  const canNavigate = pickedUp ? Boolean(navCustomer) : (navShops.length > 0 || Boolean(navCustomer));

  return (
    <View style={styles.root}>
      <RiderDeliveryMap order={order} pickedUp={pickedUp} style={styles.map} bottomInset={sheetHeight} />

      <SafeAreaView
        style={styles.sheet}
        edges={['bottom']}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.sheetHandle} />
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
              <AppIcon name="back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            {elapsedLabel ? (
              <View style={styles.timerRowCenter}>
                <AppIcon name="clock" size={16} color={colors.textPrimary} />
                <Text style={styles.timerBig}>{elapsedLabel}</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {canNavigate ? (
              <TouchableOpacity
                style={[styles.callBtn, styles.navBtn]}
                onPress={handleNavigate}
                accessibilityLabel="Navigate in Google Maps"
              >
                <AppIcon name="navigation" size={18} color={colors.textInverse} />
              </TouchableOpacity>
            ) : null}
            {phone ? (
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${phone}`)}
                accessibilityLabel="Call customer"
              >
                <AppIcon name="phone" size={18} color={colors.textInverse} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Drop-off only matters once the rider actually has the order —
              before pickup they need the shop, not the customer address. */}
          {order.address && pickedUp ? (
            <View style={styles.addressBlock}>
              <View style={styles.addressIcon}>
                <AppIcon name="map" size={16} color={colors.saffronDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>Drop-off</Text>
                <Text style={styles.addressText} numberOfLines={2}>{order.address}</Text>
              </View>
            </View>
          ) : null}

          {Array.isArray(order.shops) && order.shops.length > 0 ? (
            <Text style={styles.shopsLine} numberOfLines={2}>
              Pickup: {order.shops.map((s) => s.name).filter(Boolean).join(' · ') || 'Shop'}
            </Text>
          ) : null}

          {order.total != null ? (
            <View style={styles.itemsBlock}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Order total</Text>
                <Text style={styles.totalValue}>₹{Number(order.total).toFixed(0)}</Text>
              </View>
            </View>
          ) : null}

          {!flags.terminal ? (
            <View style={styles.actions}>
              {flags.showOutForDelivery ? (
                <SlideToConfirm
                  label="Slide to send out for delivery"
                  busy={actionBusy === 'ofd'}
                  onConfirm={handleOutForDelivery}
                />
              ) : null}
              {flags.showDelivered ? (
                <SlideToConfirm
                  label="Slide to mark delivered"
                  busy={actionBusy === 'delivered'}
                  onConfirm={handleDelivered}
                  colorFrom={colors.btnSuccessStart}
                  colorTo={colors.btnSuccessEnd}
                  thumbColor={colors.success}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.doneBanner}>
              <Text style={styles.doneText}>
                {flags.status === 'Delivered' ? 'Delivery complete ✓' : 'Order cancelled'}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const THUMB_SIZE = 52;
const TRACK_PAD = 5;

function SlideToConfirm({
  label,
  onConfirm,
  busy,
  colorFrom = colors.btnInfoStart,
  colorTo = colors.btnInfoEnd,
  thumbColor = colors.info,
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE - TRACK_PAD * 2, 1);
  const maxTranslateRef = useRef(maxTranslate);
  useEffect(() => { maxTranslateRef.current = maxTranslate; }, [maxTranslate]);

  const translateX = useRef(new Animated.Value(0)).current;
  const wasBusyRef = useRef(false);

  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
    wasBusyRef.current = busy;
  }, [busy, translateX]);

  // Chevrons nudge right inside the thumb — hints "keep sliding"
  const arrowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [arrowAnim]);
  const chevronShift = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gesture) => Math.abs(gesture.dx) > 4,
      onPanResponderMove: (evt, gesture) => {
        const x = Math.min(Math.max(gesture.dx, 0), maxTranslateRef.current);
        translateX.setValue(x);
      },
      onPanResponderRelease: (evt, gesture) => {
        if (gesture.dx >= maxTranslateRef.current * 0.7) {
          Animated.timing(translateX, {
            toValue: maxTranslateRef.current,
            duration: 150,
            useNativeDriver: false,
          }).start();
          onConfirm();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
        }
      },
    })
  ).current;

  const textOpacity = translateX.interpolate({
    inputRange: [0, Math.max(maxTranslate * 0.6, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.slideTrack}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <LinearGradient
        colors={[colorFrom, colorTo]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      <Animated.Text style={[styles.slideTrackText, { opacity: textOpacity }]}>
        {label}
      </Animated.Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.slideThumb, { transform: [{ translateX }] }]}
      >
        {busy ? (
          <ActivityIndicator color={thumbColor} />
        ) : (
          <View style={styles.slideThumbChevrons}>
            <Animated.View style={{ transform: [{ translateX: chevronShift }] }}>
              <AppIcon name="chevronRight" size={22} color={thumbColor} />
            </Animated.View>
            <Animated.View style={{ marginLeft: -14, transform: [{ translateX: chevronShift }] }}>
              <AppIcon name="chevronRight" size={22} color={thumbColor} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgApp },
  container: { flex: 1, backgroundColor: colors.bgApp, alignItems: 'center' },
  map: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '48%',
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    ...shadows.cardRaised,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerRowCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  timerBig: { ...typography.h2, fontSize: 20 },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.circle,
    backgroundColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtn: {
    marginRight: spacing.sm,
    backgroundColor: colors.btnInfoStart,
  },
  addressBlock: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.saffronLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.saffronDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addressText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 20,
  },
  shopsLine: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  itemsBlock: {
    backgroundColor: colors.bgApp,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  totalValue: { ...typography.caption, color: colors.textPrimary, fontWeight: '800' },
  actions: { gap: spacing.sm },
  slideTrack: {
    height: THUMB_SIZE + TRACK_PAD * 2,
    borderRadius: radius.circle,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: TRACK_PAD,
  },
  slideTrackText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    paddingLeft: THUMB_SIZE + TRACK_PAD * 2,
  },
  slideThumb: {
    position: 'absolute',
    left: TRACK_PAD,
    top: TRACK_PAD,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.circle,
    backgroundColor: colors.textInverse,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  slideThumbChevrons: { flexDirection: 'row', alignItems: 'center' },
  doneBanner: {
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  doneText: { color: colors.successDark, fontWeight: '800' },
  errorText: { color: colors.error, textAlign: 'center', margin: spacing.lg },
  backBtn: { marginTop: spacing.md, padding: spacing.md },
  backBtnText: { color: colors.saffron, fontWeight: '700' },
});
