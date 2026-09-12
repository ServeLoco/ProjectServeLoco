import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';
import { riderApi, subscribeRealtime } from '../../api';
import ShopToggle from '../../components/shop/ShopToggle';
import AppIcon from '../../components/AppIcon';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useRiderOfferAlert } from '../../hooks/useRiderOfferAlert';
import { useRiderLocationTracking } from '../../hooks/useRiderLocationTracking';
import { useRiderIdleLocationPing } from '../../hooks/useRiderIdleLocationPing';
import { useRiderBackgroundLocationTracking } from '../../hooks/useRiderBackgroundLocationTracking';
import { RiderBackgroundLocationDisclosure } from '../../components/RiderBackgroundLocationDisclosure';
import {
  getRiderActionFlags,
  isOutForDelivery,
  mergeRiderOrder,
} from '../../utils/riderOrderActions';
import { elapsedSecondsFromStart, formatElapsed } from '../../utils/riderOfferTime';
import {
  markAppBackground,
  markAppForeground,
  markOfferHandledForeground,
} from '../../utils/orderAlarmNotifications';
import { canShowOverlay, requestOverlayPermission } from '../../utils/overlayOfferCard';
import RiderOfferPopup from './RiderOfferPopup';

// Not re-nagged every load once dismissed — the rider can still grant it
// later from the OS Settings screen `requestOverlayPermission()` opens.
const OVERLAY_BANNER_DISMISSED_KEY = 'serveloco:overlayBannerDismissed';


function offerIdOf(o) {
  return o?.id ?? o?.offerId ?? null;
}

function assignedAtMs(job) {
  const raw = job?.riderAssignedAt || job?.rider_assigned_at
    || job?.createdAt || job?.created_at;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

// Oldest-accepted job first — the API doesn't guarantee this ordering itself.
function sortAssignmentsOldestFirst(list) {
  return [...list].sort((a, b) => assignedAtMs(a) - assignedAtMs(b));
}

/** Oldest-first unique queue; keep richer payload when merging. */
function normalizeOfferQueue(list) {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  list.forEach((o) => {
    const id = offerIdOf(o);
    if (id == null) return;
    const key = String(id);
    const prev = byId.get(key);
    byId.set(key, prev ? { ...prev, ...o } : o);
  });
  return Array.from(byId.values()).sort(
    (a, b) => Number(offerIdOf(a)) - Number(offerIdOf(b)),
  );
}

function upsertOfferInQueue(prev, incoming) {
  if (!incoming || offerIdOf(incoming) == null) return prev || [];
  return normalizeOfferQueue([...(prev || []), incoming]);
}

/**
 * Premium rider dashboard — online hero, metrics, active job with step rail.
 */
export default function RiderDashboardScreen({ navigation }) {
  const rider = useAuthStore((s) => s.rider);
  const setRider = useAuthStore((s) => s.setRider);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();

  const [isOnline, setIsOnline] = useState(Boolean(rider?.isOnline || rider?.is_online));
  const [toggleBusy, setToggleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Offer queue (oldest first). Popup shows index 0; accept/reject advances.
  const [offerQueue, setOfferQueue] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [overlayBannerVisible, setOverlayBannerVisible] = useState(false);
  const activeOffer = offerQueue[0] || null;
  // Featured job card — whichever the rider picked from the queue chips,
  // falling back to the first assignment (also covers the single-job case).
  const assignment = (
    assignments.find((a) => String(a.id) === String(selectedJobId)) || assignments[0] || null
  );
  const mountedRef = useRef(true);
  const isOnlineRef = useRef(isOnline);
  const pulse = useRef(new Animated.Value(1)).current;
  const fastPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Prompt (once, dismissible) to enable the floating offer card for when
  // another app is open and the screen is on — the lock-screen alarm card
  // doesn't need this permission, only this one scenario does.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    (async () => {
      const dismissed = await AsyncStorage.getItem(OVERLAY_BANNER_DISMISSED_KEY).catch(() => null);
      if (dismissed || cancelled) return;
      const granted = await canShowOverlay();
      if (!cancelled && !granted) setOverlayBannerVisible(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const dismissOverlayBanner = useCallback(() => {
    setOverlayBannerVisible(false);
    AsyncStorage.setItem(OVERLAY_BANNER_DISMISSED_KEY, '1').catch(() => {});
  }, []);

  // Heartbeat so the alarm notifier (which may run in Android's separate
  // headless background-message JS instance) can tell this real instance is
  // actually on screen right now — see markAppForeground's own comment.
  useEffect(() => {
    markAppForeground();
    const sub = AppState.addEventListener('change', (next) => {
      // Clearing on the way out matters as much as beating while in: a stale
      // heartbeat keeps reading fresh for FOREGROUND_FRESH_MS after the screen
      // locks, and the alarm suppresses itself for that whole window.
      if (next === 'active') markAppForeground();
      else markAppBackground();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') markAppForeground();
    }, 5000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
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
      let offers = me?.activeOffers || me?.active_offers || null;
      // /me already carries the offer queue; the extra offers/active call only
      // adds shop names for the popup. Skip it when /me says there are zero
      // offers — fetchAll runs on every socket event/focus, so this halves the
      // idle dashboard's request volume. Still called when /me lacks the queue
      // field entirely (older API) or offers exist (need shop enrichment).
      if (!Array.isArray(offers) || offers.length > 0) {
        try {
          const offerRes = await riderApi.getActiveOffer();
          if (Array.isArray(offerRes?.offers)) {
            offers = offerRes.offers;
          } else if (offerRes?.offer) {
            offers = [offerRes.offer];
          } else if (offerRes && offerRes.offer === null) {
            offers = [];
          }
        } catch (_) { /* keep from me */ }
      }
      if (!mountedRef.current) return;
      if (!Array.isArray(offers)) {
        const one = me?.activeOffer || me?.active_offer || null;
        offers = one ? [one] : [];
      }
      setOfferQueue(normalizeOfferQueue(offers));
      const list = me?.currentAssignments || me?.current_assignments;
      if (Array.isArray(list) && list.length > 0) {
        setAssignments(sortAssignmentsOldestFirst(list));
      } else {
        const one = me?.currentAssignment || me?.current_assignment || null;
        setAssignments(one ? [one] : []);
      }
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

  // Re-sync when returning from the map screen so card buttons match map actions.
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  useEffect(() => {
    const unsubs = [
      subscribeRealtime('rider.offer.created', (payload) => {
        const incoming = {
          id: payload.offerId || payload.offer_id,
          offerId: payload.offerId || payload.offer_id,
          orderId: payload.orderId || payload.order_id,
          orderNumber: payload.orderNumber || payload.order_number,
          expiresAt: payload.expiresAt || payload.expires_at,
          expires_at: payload.expiresAt || payload.expires_at,
          total: payload.total,
        };
        // Enqueue without dropping the offer currently on screen.
        setOfferQueue((prev) => upsertOfferInQueue(prev, incoming));
        riderApi.getActiveOffer()
          .then((res) => {
            if (!mountedRef.current) return;
            if (Array.isArray(res?.offers)) {
              setOfferQueue(normalizeOfferQueue(res.offers));
            } else if (res?.offer) {
              setOfferQueue((prev) => upsertOfferInQueue(prev, res.offer));
            }
          })
          .catch(() => {});
        // Warm background: ring until accept/reject (main JS — works with Metro).
        if (AppState.currentState !== 'active') {
          const { displayAlarmNotification, ALERT_TYPE_RIDER_OFFER } = require('../../utils/orderAlarmNotifications');
          displayAlarmNotification({
            alertType: ALERT_TYPE_RIDER_OFFER,
            type: 'rider_offer',
            offerId: String(incoming.offerId || ''),
            orderId: String(incoming.orderId || ''),
            orderNumber: String(incoming.orderNumber || ''),
            expiresAt: String(incoming.expiresAt || ''),
            total: String(incoming.total ?? ''),
          }).catch(() => {});
        } else {
          // Receiving this socket event on the LIVE main-JS instance is airtight
          // proof the app is genuinely foregrounded — unlike AppState.currentState
          // read from inside Android's headless setBackgroundMessageHandler JS
          // context, which can misreport 'background' even while this screen is
          // visibly on screen, letting the full-screen alarm slip through. The
          // in-app popup + ring (useRiderOfferAlert) already covers foreground —
          // cancel any alarm that headless path already fired for this offer.
          const { cancelRiderOfferAlarm } = require('../../utils/orderAlarmNotifications');
          cancelRiderOfferAlarm().catch(() => {});
          // Also mark this exact offer as foreground-handled — a slower FCM
          // data message for the SAME offer can still land after this cancel
          // and re-trigger the alarm card/notification if not blocked by id.
          markOfferHandledForeground(incoming.offerId).catch(() => {});
        }
      }),
      // Server reminder while offer still pending — rehydrate popup if needed.
      subscribeRealtime('rider.offer.reminder', (payload) => {
        const incoming = {
          id: payload.offerId || payload.offer_id,
          offerId: payload.offerId || payload.offer_id,
          orderId: payload.orderId || payload.order_id,
          orderNumber: payload.orderNumber || payload.order_number,
          expiresAt: payload.expiresAt || payload.expires_at,
          expires_at: payload.expiresAt || payload.expires_at,
          total: payload.total,
        };
        if (!incoming.id) return;
        setOfferQueue((prev) => upsertOfferInQueue(prev, incoming));
        // Same headless-AppState race as 'rider.offer.created' — the server's
        // ~15s FCM re-push can slip a full-screen alarm through even here.
        const { cancelRiderOfferAlarm } = require('../../utils/orderAlarmNotifications');
        cancelRiderOfferAlarm().catch(() => {});
        if (AppState.currentState === 'active') {
          markOfferHandledForeground(incoming.id).catch(() => {});
        }
      }),
      subscribeRealtime('rider.offer.expired', (payload) => {
        const expiredId = payload.offerId || payload.offer_id;
        setOfferQueue((prev) => prev.filter((o) => {
          const id = o.id || o.offerId;
          return !(id && Number(id) === Number(expiredId));
        }));
        fetchAll();
      }),
      subscribeRealtime('rider.offer.revoked', () => {
        setOfferQueue([]);
        fetchAll();
      }),
      subscribeRealtime('rider.assignment.updated', (payload) => {
        // Patch local list immediately when payload includes order, then hard refresh.
        if (payload?.order?.id) {
          setAssignments((prev) => {
            const id = payload.order.id;
            const status = payload.order.status;
            if (status === 'Delivered' || status === 'Cancelled') {
              return prev.filter((a) => String(a.id) !== String(id));
            }
            let found = false;
            const next = prev.map((a) => {
              if (String(a.id) !== String(id)) return a;
              found = true;
              return mergeRiderOrder(a, payload.order);
            });
            return found ? next : prev;
          });
        }
        fetchAll();
      }),
      // Admin toggled online/offline from web Riders page — sync toggle.
      subscribeRealtime('rider.status.updated', (payload) => {
        const online = payload?.isOnline ?? payload?.is_online;
        if (typeof online === 'boolean') {
          setIsOnline(online);
          isOnlineRef.current = online;
        }
        fetchAll();
      }),
      subscribeRealtime('lifecycle.foreground', () => fetchAll()),
      subscribeRealtime('lifecycle.reconnected', () => fetchAll()),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [fetchAll]);

  // Multi-order: still alert for new offers even if rider already has jobs.
  // Continuous local chime while popup is open; server re-pushes every ~15s
  // until accept/reject so closed-app riders keep getting FCM banners.
  useRiderOfferAlert(activeOffer);
  // Pause the dashboard's own GPS watch while RiderOrder is on top — that
  // screen's RiderDeliveryMap runs its own watcher, and a single ping fans
  // out server-side to every active assignment regardless of which job
  // screen is open, so running both here was a duplicate watcher (2x
  // battery/GPS calls) rather than extra coverage.
  useRiderLocationTracking(isFocused ? assignment : null);
  // While free, keep a coarse position on the server — offers are ranked by
  // distance from the pickup shop, and a rider who never pings is invisible to
  // the near rings. Stops the moment a job starts (the watcher above takes over).
  useRiderIdleLocationPing(isOnline, Boolean(assignment));

  // Background-capable twin of the idle ping above — keeps position fresh for
  // the server's nearest-ring offer match even while the app is backgrounded
  // or the screen is locked. Same online/no-job scope, separate OS permission.
  const {
    disclosureVisible: bgLocationDisclosureVisible,
    onDisclosureAllow: handleBgLocationDisclosureAllow,
    onDisclosureDecline: handleBgLocationDisclosureDecline,
  } = useRiderBackgroundLocationTracking(isOnline, Boolean(assignment));

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

  const refreshOfferQueue = useCallback(async () => {
    try {
      const res = await riderApi.getActiveOffer();
      if (!mountedRef.current) return;
      if (Array.isArray(res?.offers)) {
        setOfferQueue(normalizeOfferQueue(res.offers));
      } else if (res?.offer) {
        setOfferQueue(normalizeOfferQueue([res.offer]));
      } else {
        setOfferQueue([]);
      }
    } catch (_) {
      setOfferQueue([]);
    }
  }, []);

  const silenceRiderAlarm = useCallback(() => {
    // Media alarm loop must stop on accept/reject (not only on notifee action).
    try {
      // Lazy requires avoid circular imports at module load.
      // eslint-disable-next-line global-require
      require('../../utils/alarmSound').stopAlarmSound();
      // eslint-disable-next-line global-require
      require('../../utils/orderAlarmNotifications').cancelRiderOfferAlarm().catch(() => {});
    } catch { /* ignore */ }
  }, []);

  const handleAcceptOffer = useCallback(async (offer) => {
    silenceRiderAlarm();
    const id = offer.id || offer.offerId;
    await riderApi.acceptOffer(id);
    // Drop accepted offer from queue, then load any next pending offer.
    setOfferQueue((prev) => prev.filter((o) => {
      const oid = o.id || o.offerId;
      return !(oid && Number(oid) === Number(id));
    }));
    await fetchAll();
    await refreshOfferQueue();
    // Stay on dashboard — accepted job shows in the queue list, rider taps
    // it to open the delivery map (see openDeliveryMap).
  }, [fetchAll, refreshOfferQueue, silenceRiderAlarm]);

  const handleRejectOffer = useCallback(async (offer) => {
    silenceRiderAlarm();
    const id = offer.id || offer.offerId;
    await riderApi.rejectOffer(id);
    setOfferQueue((prev) => prev.filter((o) => {
      const oid = o.id || o.offerId;
      return !(oid && Number(oid) === Number(id));
    }));
    await fetchAll();
    // Next offer in queue (if any) becomes the new popup front.
    await refreshOfferQueue();
  }, [fetchAll, refreshOfferQueue, silenceRiderAlarm]);

  const openDeliveryMap = useCallback((job) => {
    if (!job?.id) return;
    // Pass snapshot so map sheet buttons match the card on first paint.
    navigation.navigate('RiderOrder', { orderId: job.id, order: job });
  }, [navigation]);

  const phone = assignment?.phone;
  const isFastDelivery = assignment?.deliveryType === 'fast' || assignment?.delivery_type === 'fast';
  const displayName = rider?.displayName || rider?.display_name || 'Rider';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Pulse the Fast badge to draw attention — Standard stays static
  useEffect(() => {
    if (!isFastDelivery) {
      fastPulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fastPulse, {
          toValue: 0.55,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(fastPulse, {
          toValue: 1,
          duration: 550,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isFastDelivery, fastPulse]);

  // Timer starts the moment the rider accepts (rider_assigned_at) and keeps
  // ticking until the job reaches a terminal state.
  const [nowTick, setNowTick] = useState(Date.now());
  const hasActiveJobs = assignments.length > 0;
  useEffect(() => {
    if (!hasActiveJobs || !isFocused) return undefined;
    // Re-sync on focus so the label is never a stale second behind.
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveJobs, isFocused]);
  const assignedAt = assignment?.riderAssignedAt || assignment?.rider_assigned_at;
  const elapsedLabel = assignedAt
    ? formatElapsed(elapsedSecondsFromStart(assignedAt, nowTick))
    : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.brandGradientStart, colors.brandGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.lg }]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting}, <Text style={styles.greetingName}>{displayName}</Text>
          </Text>
          <View style={styles.headerStatusPill}>
            <Animated.View
              style={[
                styles.headerStatusDot,
                {
                  opacity: isOnline ? pulse : 0.6,
                  backgroundColor: isOnline ? colors.success100 : colors.textInverse,
                },
              ]}
            />
            <Text style={styles.headerStatusText}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <ShopToggle
            value={isOnline}
            onValueChange={handleToggle}
            activeColor="#00C853"
            disabled={toggleBusy || loading || Boolean(assignment)}
            size="md"
          />
        </View>
      </LinearGradient>

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

        {error ? (
          <View style={styles.errorBanner}>
            <AppIcon name="close" size={14} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {overlayBannerVisible ? (
          <View style={styles.overlayBanner}>
            <AppIcon name="notification" size={18} color={colors.saffronDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.overlayBannerTitle}>See offers over other apps</Text>
              <Text style={styles.overlayBannerText}>
                Allow ServeLoco to show the accept/reject card even while
                you&apos;re using another app.
              </Text>
            </View>
            <TouchableOpacity onPress={requestOverlayPermission} style={styles.overlayBannerAllow}>
              <Text style={styles.overlayBannerAllowText}>Allow</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismissOverlayBanner} hitSlop={8}>
              <AppIcon name="close" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {assignments.length > 0 ? (
          <View style={styles.queueSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {assignments.length > 1 ? 'Delivery queue' : 'Current delivery'}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {assignments.length > 1
                    ? `${assignments.length} jobs running — tap one to open`
                    : 'In progress right now'}
                </Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>
                  {assignments.length}
                </Text>
              </View>
            </View>

            {assignments.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.jobChipsRow}
              >
                {assignments.map((job) => {
              const jobFlags = getRiderActionFlags(job);
              const isSelected = assignment && String(job.id) === String(assignment.id);
              const isFast = (job.deliveryType || job.delivery_type) === 'fast';
              const jobCustomerName = job.customerName || job.customer_name || 'Customer';
              const jobAssignedAt = job.riderAssignedAt || job.rider_assigned_at;
              const jobElapsedLabel = jobAssignedAt
                ? formatElapsed(elapsedSecondsFromStart(jobAssignedAt, nowTick))
                : null;
              return (
                <TouchableOpacity
                  key={job.id}
                  style={[styles.jobChip, isSelected && styles.jobChipActive]}
                  onPress={() => setSelectedJobId(job.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.jobChipTopRow}>
                    <View
                      style={[
                        styles.jobChipDot,
                        isOutForDelivery(jobFlags.status) && styles.jobChipDotHot,
                      ]}
                    />
                    <Text
                      style={[styles.jobChipText, isSelected && styles.jobChipTextActive]}
                      numberOfLines={1}
                    >
                      {jobCustomerName}
                    </Text>
                  </View>
                  <View style={styles.jobChipBottomRow}>
                    <View style={[styles.jobChipBadge, isFast && styles.jobChipBadgeFast]}>
                      <Text
                        style={[
                          styles.jobChipBadgeText,
                          isFast && styles.jobChipBadgeTextFast,
                        ]}
                      >
                        {isFast ? 'Fast' : 'Standard'}
                      </Text>
                    </View>
                    {jobElapsedLabel ? (
                      <View style={styles.jobChipTimer}>
                        <AppIcon
                          name="clock"
                          size={10}
                          color={isSelected ? colors.textInverse : colors.textSecondary}
                        />
                        <Text
                          style={[styles.jobChipTimerText, isSelected && styles.jobChipTextActive]}
                        >
                          {jobElapsedLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
                })}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {loading && !assignment ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
        ) : assignment ? (
          <View style={styles.jobCard}>
            <View style={styles.jobBody}>
              <View style={styles.jobHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.jobOrderNum} numberOfLines={1}>
                    #{assignment.orderNumber || assignment.order_number}
                  </Text>
                </View>
                <View style={styles.jobHeaderRight}>
                  <Animated.View
                    style={[
                      styles.deliveryTypeBadge,
                      isFastDelivery && styles.deliveryTypeBadgeFast,
                      isFastDelivery && { opacity: fastPulse },
                    ]}
                  >
                    <Text style={[styles.deliveryTypeBadgeText, isFastDelivery && styles.deliveryTypeBadgeTextFast]}>
                      {isFastDelivery ? 'Fast' : 'Standard'}
                    </Text>
                  </Animated.View>
                  {elapsedLabel ? (
                    <View style={styles.timerChip}>
                      <AppIcon name="clock" size={12} color={colors.textSecondary} />
                      <Text style={styles.timerChipText}>{elapsedLabel}</Text>
                    </View>
                  ) : null}
                </View>
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

              {Array.isArray(assignment.items) && assignment.items.length > 0 ? (
                <View style={styles.itemsBlock}>
                  <Text style={styles.itemsLabel}>Order items</Text>
                  {assignment.items.map((it, idx) => {
                    const shopName = it.shopName || it.shop_name;
                    return (
                      <View key={it.id ?? idx} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemLine} numberOfLines={1}>
                            {it.quantity}x {it.productName || it.product_name}
                            {shopName ? <Text style={styles.itemShopName}> · {shopName}</Text> : null}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {assignment.total != null ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Order total</Text>
                      <Text style={styles.totalValue}>₹{Number(assignment.total).toFixed(0)}</Text>
                    </View>
                  ) : null}
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

              <TouchableOpacity
                onPress={() => openDeliveryMap(assignment)}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={[colors.btnInfoStart, colors.btnInfoEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mapOpenBtn}
                >
                  <AppIcon name="map" size={20} color={colors.textInverse} />
                  <Text style={styles.mapOpenBtnText}>Start</Text>
                  <AppIcon name="chevronRight" size={16} color={colors.textInverse} />
                </LinearGradient>
              </TouchableOpacity>

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
              <Text style={styles.offerWaitingTitle}>
                {offerQueue.length > 1
                  ? `${offerQueue.length} offers in queue`
                  : 'New offer waiting'}
              </Text>
              <Text style={styles.offerWaitingSub}>
                {offerQueue.length > 1
                  ? 'Respond one by one in the popup — next opens after accept/reject'
                  : 'Accept or reject in the popup — timer is running'}
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

      {/* Always mounted: the popup plays its own slide-down when the offer
          goes away, which an unmount here would cut off. It renders nothing
          while there is no offer. */}
      <RiderOfferPopup
        offer={activeOffer}
        onAccept={handleAcceptOffer}
        onReject={handleRejectOffer}
        hasActiveJobs={assignments.length > 0}
        activeJobCount={assignments.length}
        queueIndex={0}
        queueTotal={offerQueue.length}
      />

      <RiderBackgroundLocationDisclosure
        visible={bgLocationDisclosureVisible}
        onAllow={handleBgLocationDisclosureAllow}
        onDecline={handleBgLocationDisclosureDecline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing[3],
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  greeting: {
    flex: 1,
    ...typography.display,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: 'rgba(255,255,255,0.92)',
  },
  greetingName: { color: colors.brandInk, fontWeight: '800' },
  body: { flex: 1, backgroundColor: colors.bgApp },
  scrollContent: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },

  headerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.glassOverlay,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  headerStatusDot: { width: 7, height: 7, borderRadius: radius.circle },
  headerStatusText: { fontSize: 11, fontWeight: '800', color: colors.textInverse },

  queueSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
  },
  sectionAccent: {
    width: 4,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.saffron,
  },
  sectionTitle: {
    ...typography.labelSmall,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 2,
  },
  countPill: {
    backgroundColor: colors.saffron,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 26,
    alignItems: 'center',
  },
  countPillText: { color: colors.textInverse, fontWeight: '800', fontSize: 12 },
  jobChipsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
  },
  jobChip: {
    minWidth: 168,
    maxWidth: 230,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing[3],
    borderRadius: 18,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  jobChipActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  jobChipTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jobChipDot: {
    width: 7,
    height: 7,
    borderRadius: radius.circle,
    backgroundColor: colors.textTertiary,
  },
  jobChipDotHot: { backgroundColor: colors.saffron },
  jobChipText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  jobChipTextActive: { color: colors.textInverse },
  jobChipBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 8,
  },
  jobChipBadge: {
    backgroundColor: colors.infoLight,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  jobChipBadgeFast: { backgroundColor: colors.saffron },
  jobChipBadgeText: { fontSize: 10, fontWeight: '800', color: colors.info },
  jobChipBadgeTextFast: { color: colors.textInverse },
  jobChipTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  jobChipTimerText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing[3],
    marginBottom: spacing.md,
    backgroundColor: colors.errorLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: { flex: 1, color: colors.error, fontWeight: '600', fontSize: 13 },

  overlayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing[3],
    marginBottom: spacing.md,
    backgroundColor: colors.saffronLight,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  overlayBannerTitle: { fontWeight: '800', fontSize: 13, color: colors.textPrimary },
  overlayBannerText: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  overlayBannerAllow: {
    backgroundColor: colors.saffronDark,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  overlayBannerAllowText: { color: colors.textInverse, fontWeight: '800', fontSize: 12 },

  jobCard: {
    flexDirection: 'row',
    marginHorizontal: spacing[3],
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.textPrimary,
    overflow: 'hidden',
    ...shadows.cardRaised,
  },
  jobBody: { flex: 1, padding: spacing.md },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  jobOrderNum: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  jobHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deliveryTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.infoLight,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  deliveryTypeBadgeFast: { backgroundColor: colors.saffron },
  deliveryTypeBadgeText: { fontSize: 13, fontWeight: '800', color: colors.info },
  deliveryTypeBadgeTextFast: { color: colors.textInverse },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timerChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },

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

  itemsBlock: {
    backgroundColor: colors.bgApp,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  itemsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  itemLine: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  itemShopName: { fontSize: 11, fontWeight: '700', color: colors.saffronDark },
  itemPrice: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  totalValue: { ...typography.body, color: colors.textPrimary, fontWeight: '800' },

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
    backgroundColor: colors.saffron,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },

  mapOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.cardRaised,
  },
  mapOpenBtnText: {
    flex: 1,
    fontWeight: '800',
    fontSize: 15,
    color: colors.textInverse,
    textAlign: 'center',
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
    marginHorizontal: spacing[3],
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
