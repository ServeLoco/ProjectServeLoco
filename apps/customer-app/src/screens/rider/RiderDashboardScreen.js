import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';
import { riderApi, subscribeRealtime } from '../../api';
import ShopToggle from '../../components/shop/ShopToggle';
import AppIcon from '../../components/AppIcon';
import { useRiderOfferAlert } from '../../hooks/useRiderOfferAlert';
import RiderOfferPopup from './RiderOfferPopup';

const HEARTBEAT_MS = 35_000;

const STEPS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'picked', label: 'Picked up' },
  { key: 'ofd', label: 'On the way' },
  { key: 'done', label: 'Delivered' },
];

function stepIndex(status, pickedUp) {
  if (status === 'Delivered') return 3;
  if (status === 'Out for Delivery') return 2;
  if (pickedUp) return 1;
  return 0;
}

/**
 * Premium rider dashboard — online hero, metrics, active job with step rail.
 */
export default function RiderDashboardScreen() {
  const rider = useAuthStore((s) => s.rider);
  const setRider = useAuthStore((s) => s.setRider);
  const logout = useAuthStore((s) => s.logout);

  const [isOnline, setIsOnline] = useState(Boolean(rider?.isOnline || rider?.is_online));
  const [toggleBusy, setToggleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOffer, setActiveOffer] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [error, setError] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const mountedRef = useRef(true);
  const isOnlineRef = useRef(isOnline);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Live pulse when online
  useEffect(() => {
    if (!isOnline) {
      pulse.setValue(0.45);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, pulse]);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const me = await riderApi.getMe();
      if (!mountedRef.current) return;
      if (me?.rider) {
        setRider(me.rider);
        setIsOnline(Boolean(me.rider.isOnline || me.rider.is_online));
      }
      let offer = me?.activeOffer || me?.active_offer || null;
      try {
        const offerRes = await riderApi.getActiveOffer();
        if (offerRes?.offer) offer = offerRes.offer;
        else if (offerRes && offerRes.offer === null) offer = null;
      } catch (_) { /* keep */ }
      if (!mountedRef.current) return;
      setActiveOffer(offer);
      setAssignment(me?.currentAssignment || me?.current_assignment || null);
    } catch (err) {
      if (mountedRef.current) setError(err?.message || 'Could not load rider status');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [setRider]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!isOnline) return undefined;
    const beat = () => {
      if (!isOnlineRef.current) return;
      riderApi.heartbeat().catch(() => {});
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') beat();
    });
    return () => {
      clearInterval(id);
      sub?.remove?.();
    };
  }, [isOnline]);

  useEffect(() => {
    const unsubs = [
      subscribeRealtime('rider.offer.created', (payload) => {
        setActiveOffer((prev) => ({
          ...(prev || {}),
          id: payload.offerId || payload.offer_id,
          offerId: payload.offerId || payload.offer_id,
          orderId: payload.orderId || payload.order_id,
          orderNumber: payload.orderNumber || payload.order_number,
          expiresAt: payload.expiresAt || payload.expires_at,
          expires_at: payload.expiresAt || payload.expires_at,
        }));
        riderApi.getActiveOffer()
          .then((res) => {
            if (res?.offer && mountedRef.current) setActiveOffer(res.offer);
          })
          .catch(() => {});
      }),
      subscribeRealtime('rider.offer.expired', (payload) => {
        setActiveOffer((prev) => {
          if (!prev) return null;
          const id = prev.id || prev.offerId;
          if (id && Number(id) === Number(payload.offerId || payload.offer_id)) return null;
          return prev;
        });
        fetchAll();
      }),
      subscribeRealtime('rider.offer.revoked', () => {
        setActiveOffer(null);
        fetchAll();
      }),
      subscribeRealtime('rider.assignment.updated', () => fetchAll()),
      subscribeRealtime('lifecycle.foreground', () => fetchAll()),
      subscribeRealtime('lifecycle.reconnected', () => fetchAll()),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [fetchAll]);

  useRiderOfferAlert(Boolean(activeOffer) && !assignment);

  const handleToggle = useCallback(async (next) => {
    const prev = isOnline;
    setIsOnline(next);
    setToggleBusy(true);
    try {
      const res = await riderApi.setOnline(next);
      if (res?.rider) setRider(res.rider);
      await fetchAll();
    } catch (err) {
      setIsOnline(prev);
      Alert.alert('Could not update status', err?.message || 'Try again');
    } finally {
      setToggleBusy(false);
    }
  }, [fetchAll, isOnline, setRider]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Go offline and sign out of rider mode?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (isOnlineRef.current) await riderApi.setOnline(false).catch(() => {});
          } finally {
            logout();
          }
        },
      },
    ]);
  }, [logout]);

  const handleAcceptOffer = useCallback(async (offer) => {
    const id = offer.id || offer.offerId;
    await riderApi.acceptOffer(id);
    setActiveOffer(null);
    await fetchAll();
  }, [fetchAll]);

  const handleRejectOffer = useCallback(async (offer) => {
    const id = offer.id || offer.offerId;
    await riderApi.rejectOffer(id);
    setActiveOffer(null);
    await fetchAll();
  }, [fetchAll]);

  const runAction = useCallback(async (key, fn) => {
    setActionBusy(key);
    try {
      await fn();
      await fetchAll();
    } catch (err) {
      Alert.alert('Action failed', err?.message || 'Try again');
    } finally {
      setActionBusy(null);
    }
  }, [fetchAll]);

  const handlePickedUp = useCallback(() => {
    if (!assignment?.id) return;
    runAction('picked_up', () => riderApi.markPickedUp(assignment.id));
  }, [assignment, runAction]);

  const handleOutForDelivery = useCallback(() => {
    if (!assignment?.id) return;
    runAction('ofd', () => riderApi.updateStatus(assignment.id, 'Out for Delivery'));
  }, [assignment, runAction]);

  const handleDelivered = useCallback(() => {
    if (!assignment?.id) return;
    Alert.alert('Mark delivered?', 'Confirm this order was delivered to the customer.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delivered',
        onPress: () => runAction('delivered', () => riderApi.updateStatus(assignment.id, 'Delivered')),
      },
    ]);
  }, [assignment, runAction]);

  const handleCancelAssignment = useCallback(() => {
    if (!assignment?.id) return;
    if (assignment.riderPickedUpAt || assignment.rider_picked_up_at) {
      Alert.alert('Cannot cancel', 'You already picked up this order.');
      return;
    }
    Alert.alert(
      'Cancel assignment?',
      'This order will be offered to another rider. You cannot receive it again.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel assignment',
          style: 'destructive',
          onPress: () => runAction('cancel', () => riderApi.cancelAssignment(assignment.id)),
        },
      ]
    );
  }, [assignment, runAction]);

  const phone = assignment?.phone;
  const pickedUp = Boolean(assignment?.riderPickedUpAt || assignment?.rider_picked_up_at);
  const status = assignment?.status;
  const currentStep = stepIndex(status, pickedUp);
  const displayName = rider?.displayName || rider?.display_name || 'Rider';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.subtitle}>Rider delivery dashboard</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.8}>
          <AppIcon name="logout" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAll(); }}
            tintColor={colors.saffron}
          />
        )}
      >
        {/* Hero online card */}
        <LinearGradient
          colors={isOnline
            ? [colors.btnSuccessStart, colors.btnSuccessEnd]
            : [colors.btnDarkStart, colors.btnDarkEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconBubble}>
              <AppIcon name="navigation" size={22} color={isOnline ? colors.successDark : colors.textInverse} />
            </View>
            <View style={styles.heroLive}>
              <Animated.View
                style={[
                  styles.liveDot,
                  {
                    opacity: isOnline ? pulse : 0.5,
                    backgroundColor: isOnline ? colors.success100 : 'rgba(255,255,255,0.7)',
                  },
                ]}
              />
              <Text style={styles.heroLiveText}>{isOnline ? 'LIVE' : 'OFF'}</Text>
            </View>
          </View>

          <View style={styles.heroRow}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.heroStatus}>{isOnline ? 'Online' : 'Offline'}</Text>
              <Text style={styles.heroSub}>
                {assignment
                  ? 'On a delivery — finish this job first'
                  : isOnline
                    ? 'Ready for new delivery offers'
                    : 'Go online to receive offers'}
              </Text>
            </View>
            <ShopToggle
              value={isOnline}
              onValueChange={handleToggle}
              activeColor={colors.success}
              disabled={toggleBusy || loading || Boolean(assignment)}
              size="lg"
            />
          </View>
        </LinearGradient>

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: colors.saffronLight }]}>
              <AppIcon name="orders" size={18} color={colors.saffronDark} />
            </View>
            <Text style={styles.metricValue}>{assignment ? 1 : 0}</Text>
            <Text style={styles.metricLabel}>Active job</Text>
          </View>
          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: isOnline ? colors.successLight : colors.surfaceMuted }]}>
              <AppIcon name="navigation" size={18} color={isOnline ? colors.success : colors.textTertiary} />
            </View>
            <Text style={[styles.metricValue, { color: isOnline ? colors.successDark : colors.textTertiary }]}>
              {isOnline ? 'On' : 'Off'}
            </Text>
            <Text style={styles.metricLabel}>Availability</Text>
          </View>
          <View style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: activeOffer ? colors.warningLight : colors.surfaceMuted }]}>
              <AppIcon name="notification" size={18} color={activeOffer ? colors.warning : colors.textTertiary} />
            </View>
            <Text style={styles.metricValue}>{activeOffer && !assignment ? 1 : 0}</Text>
            <Text style={styles.metricLabel}>Offers</Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <AppIcon name="close" size={14} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {assignment ? 'Current delivery' : 'Job queue'}
          </Text>
          {assignment ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>1</Text>
            </View>
          ) : null}
        </View>

        {loading && !assignment ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
        ) : assignment ? (
          <View style={styles.jobCard}>
            <View style={styles.jobAccent} />
            <View style={styles.jobBody}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobOrderNum}>
                  #{assignment.orderNumber || assignment.order_number}
                </Text>
                <View style={[
                  styles.statusChip,
                  status === 'Out for Delivery' && styles.statusChipHot,
                  pickedUp && status !== 'Out for Delivery' && styles.statusChipOk,
                ]}
                >
                  <Text style={[
                    styles.statusChipText,
                    status === 'Out for Delivery' && styles.statusChipTextHot,
                    pickedUp && status !== 'Out for Delivery' && styles.statusChipTextOk,
                  ]}
                  >
                    {status || 'Assigned'}
                  </Text>
                </View>
              </View>

              {/* Step rail */}
              <View style={styles.stepRail}>
                {STEPS.map((step, i) => {
                  const done = i <= currentStep;
                  const active = i === currentStep;
                  return (
                    <View key={step.key} style={styles.stepItem}>
                      <View style={styles.stepTrackRow}>
                        <View style={[
                          styles.stepDot,
                          done && styles.stepDotDone,
                          active && styles.stepDotActive,
                        ]}
                        >
                          {done ? (
                            <AppIcon name="check" size={10} color={colors.textInverse} />
                          ) : null}
                        </View>
                        {i < STEPS.length - 1 ? (
                          <View style={[styles.stepLine, i < currentStep && styles.stepLineDone]} />
                        ) : null}
                      </View>
                      <Text style={[styles.stepLabel, done && styles.stepLabelDone]} numberOfLines={1}>
                        {step.label}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {assignment.address ? (
                <View style={styles.addressBlock}>
                  <View style={styles.addressIcon}>
                    <AppIcon name="map" size={16} color={colors.saffronDark} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addressLabel}>Drop-off</Text>
                    <Text style={styles.addressText}>{assignment.address}</Text>
                  </View>
                </View>
              ) : null}

              {(assignment.customerName || assignment.customer_name || phone) ? (
                <View style={styles.customerRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(assignment.customerName || assignment.customer_name || 'C').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>
                      {assignment.customerName || assignment.customer_name || 'Customer'}
                    </Text>
                    {phone ? <Text style={styles.customerPhone}>{phone}</Text> : null}
                  </View>
                  {phone ? (
                    <TouchableOpacity
                      style={styles.callFab}
                      onPress={() => Linking.openURL(`tel:${phone}`)}
                      activeOpacity={0.85}
                    >
                      <AppIcon name="phone" size={18} color={colors.textInverse} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {/* Primary action stack */}
              <View style={styles.actionsCol}>
                {!pickedUp && status !== 'Out for Delivery' && status !== 'Delivered' ? (
                  <PrimaryBtn
                    label="Mark picked up"
                    icon="check"
                    busy={actionBusy === 'picked_up'}
                    onPress={handlePickedUp}
                    variant="saffron"
                  />
                ) : null}
                {status !== 'Out for Delivery' && status !== 'Delivered' ? (
                  <PrimaryBtn
                    label="Out for delivery"
                    icon="navigation"
                    busy={actionBusy === 'ofd'}
                    onPress={handleOutForDelivery}
                    variant="success"
                  />
                ) : null}
                {status === 'Out for Delivery' ? (
                  <PrimaryBtn
                    label="Mark delivered"
                    icon="check"
                    busy={actionBusy === 'delivered'}
                    onPress={handleDelivered}
                    variant="success"
                  />
                ) : null}
                {!pickedUp && status !== 'Out for Delivery' && status !== 'Delivered' ? (
                  <TouchableOpacity
                    style={styles.ghostDanger}
                    onPress={handleCancelAssignment}
                    disabled={actionBusy === 'cancel'}
                    activeOpacity={0.85}
                  >
                    {actionBusy === 'cancel' ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={styles.ghostDangerText}>Cancel assignment</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : activeOffer ? (
          <View style={styles.offerWaitingCard}>
            <LinearGradient
              colors={[colors.brandGradientStart, colors.brandGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.offerWaitingInner}
            >
              <AppIcon name="notification" size={28} color={colors.textInverse} />
              <Text style={styles.offerWaitingTitle}>New offer waiting</Text>
              <Text style={styles.offerWaitingSub}>
                Accept or reject in the popup — timer is running
              </Text>
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <AppIcon name="navigation" size={32} color={colors.saffronDark} />
            </View>
            <Text style={styles.emptyTitle}>
              {isOnline ? 'Waiting for offers' : 'You are offline'}
            </Text>
            <Text style={styles.emptyText}>
              {isOnline
                ? 'When a shop accepts an order, you may get a delivery offer here.'
                : 'Turn on availability above to start receiving deliveries.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {activeOffer && !assignment ? (
        <RiderOfferPopup
          offer={activeOffer}
          onAccept={handleAcceptOffer}
          onReject={handleRejectOffer}
        />
      ) : null}
    </SafeAreaView>
  );
}

function PrimaryBtn({ label, icon, onPress, busy, variant = 'saffron' }) {
  const grad = variant === 'success'
    ? [colors.btnSuccessStart, colors.btnSuccessEnd]
    : [colors.btnHighlightStart, colors.btnHighlightEnd];
  return (
    <TouchableOpacity onPress={onPress} disabled={Boolean(busy)} activeOpacity={0.9}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtn}>
        {busy ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <AppIcon name={icon} size={18} color={colors.textInverse} />
            <Text style={styles.primaryBtnText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.display, fontSize: 26, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.circle,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  body: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl },

  heroCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    ...shadows.cardRaised,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heroIconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.circle,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: radius.circle,
  },
  heroLiveText: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroStatus: {
    color: colors.textInverse,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
    lineHeight: 20,
  },

  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadows.sm,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 28,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.labelSmall,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countPill: {
    marginLeft: spacing.sm,
    backgroundColor: colors.saffronLight,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countPillText: { color: colors.saffronDark, fontWeight: '800', fontSize: 12 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.errorLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: { flex: 1, color: colors.error, fontWeight: '600', fontSize: 13 },

  jobCard: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.cardRaised,
  },
  jobAccent: { width: 6, backgroundColor: colors.saffron },
  jobBody: { flex: 1, padding: spacing.lg },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  jobOrderNum: { ...typography.h2, fontSize: 22, color: colors.textPrimary },
  statusChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusChipHot: { backgroundColor: colors.badgeHotBg },
  statusChipOk: { backgroundColor: colors.successLight },
  statusChipText: { fontWeight: '800', fontSize: 12, color: colors.textSecondary },
  statusChipTextHot: { color: colors.badgeHotText },
  statusChipTextOk: { color: colors.successDark },

  stepRail: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  stepItem: { flex: 1 },
  stepTrackRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.circle,
    backgroundColor: colors.grey100,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepDotActive: {
    backgroundColor: colors.saffron,
    borderColor: colors.saffron,
    ...shadows.sm,
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: colors.grey100,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  stepLineDone: { backgroundColor: colors.success },
  stepLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '600',
    marginTop: 6,
  },
  stepLabelDone: { color: colors.textSecondary, fontWeight: '700' },

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

  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '800', fontSize: 18, color: colors.textPrimary },
  customerName: { ...typography.bodyBold, color: colors.textPrimary },
  customerPhone: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  callFab: {
    width: 44,
    height: 44,
    borderRadius: radius.circle,
    backgroundColor: colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },

  actionsCol: { gap: spacing.sm },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 16,
  },
  ghostDanger: {
    minHeight: 48,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostDangerText: { color: colors.error, fontWeight: '800', fontSize: 14 },

  offerWaitingCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.cardRaised,
  },
  offerWaitingInner: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  offerWaitingTitle: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 20,
    marginTop: spacing.md,
  },
  offerWaitingSub: {
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: spacing.xs,
    fontWeight: '500',
    lineHeight: 20,
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.circle,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 21,
    maxWidth: 280,
  },
});
