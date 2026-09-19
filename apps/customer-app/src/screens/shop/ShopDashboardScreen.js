import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, Animated, AppState, Easing, FlatList, Platform,
  RefreshControl, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import notifee from '@notifee/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows, glass, glassRadius, glassShadow } from '../../theme';
import { useAuthStore } from '../../stores';
import {
  shopApi,
  subscribeRealtime,
  subscribeRealtimeLifecycle,
  getRealtimeConnectionState,
} from '../../api';
import { useNewOrderAlert } from '../../hooks/useNewOrderAlert';
import { stopAlarmSound } from '../../utils/alarmSound';
import {
  cancelOrderAlarm,
  displayAlarmNotification,
  markAppBackground,
  markAppForeground,
} from '../../utils/orderAlarmNotifications';
import { canShowOverlay, requestOverlayPermission } from '../../utils/overlayOfferCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppIcon from '../../components/AppIcon';
import ShopToggle from '../../components/shop/ShopToggle';
import TimePickerModal from '../../components/shop/TimePickerModal';
import NewOrderPopup from './NewOrderPopup';
import SlideToConfirm from '../../components/shop/SlideToConfirm';

function formatDisplayTime(hhmm) {
  if (!hhmm) return '--:--';
  const [h, m] = String(hhmm).split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

function formatElapsed(startTime, nowMs) {
  const start = new Date(startTime).getTime();
  if (!startTime || Number.isNaN(start)) return '0:00:00';
  const diffSec = Math.max(0, Math.floor((nowMs - start) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Cap for ackedOrderIdsRef below — this screen can stay mounted for a shop's
// entire shift on an always-on tablet.
const ACKED_ORDER_IDS_CAP = 200;

// Shown once, dismissible. Shared prompt copy with the rider dashboard — the
// same OS permission backs both cards.
const OVERLAY_BANNER_DISMISSED_KEY = 'serveloco:shopOverlayBannerDismissed';
// Android 14 stopped auto-granting USE_FULL_SCREEN_INTENT to apps that are not
// dialers or alarm clocks, and revoked it on upgrade. Without it a new order
// arriving on a locked or dark phone rings with no card to open — the shop
// counterpart of the rider dashboard's prompt.
const FULLSCREEN_BANNER_DISMISSED_KEY = 'serveloco:shopFullScreenIntentBannerDismissed';

/**
 * ShopDashboardScreen
 * Premium shop-owner dashboard: live open/closed toggle, active-order queue,
 * and a non-dismissible Accept/Reject popup for incoming orders.
 */
export default function ShopDashboardScreen() {
  // The screen stays mounted while other tabs are open, so the light status
  // bar has to be scoped to focus or it leaks onto the light Orders/Products.
  const isScreenFocused = useIsFocused();
  const shop = useAuthStore((s) => s.shop);

  // Same greeting header as rider mode.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── Shop open/closed toggle ──────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(Boolean(shop?.isOpen));
  const [toggleBusy, setToggleBusy] = useState(false);
  // fetchAll() (focus effect, socket events, foreground/reconnect) can race
  // an in-flight PATCH /shop/me/toggle and overwrite the optimistic isOpen
  // with the pre-toggle DB value — this ref stops it from clobbering the
  // toggle while one is in flight (fixes "toggle needs a second press").
  const toggleInFlightRef = useRef(false);

  // ── Auto open/close schedule ─────────────────────────────────────────
  const [openTime, setOpenTime] = useState(shop?.openTime || null);
  const [closeTime, setCloseTime] = useState(shop?.closeTime || null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [pickerField, setPickerField] = useState(null); // 'open' | 'close' | null
  const scheduleEnabled = Boolean(openTime && closeTime);

  // ── Orders ────────────────────────────────────────────────────────────
  const [activeOrders, setActiveOrders] = useState([]); // confirmed:true
  const [pendingQueue, setPendingQueue] = useState([]); // confirmed:false && rejected:false
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const mountedRef = useRef(true);

  // ── Order-cancelled notice ───────────────────────────────────────────
  // Shown for 3s when admin/backend cancels an order the shop already
  // accepted (or was still queued to accept), so the owner isn't left
  // guessing why a card silently vanished mid-prep.
  const [cancelledNotice, setCancelledNotice] = useState(null); // { orderNumber, items }
  const cancelledNoticeTimerRef = useRef(null);

  const showCancelledNotice = useCallback((order) => {
    if (!order) return;
    if (cancelledNoticeTimerRef.current) clearTimeout(cancelledNoticeTimerRef.current);
    setCancelledNotice({
      orderNumber: order.orderNumber || order.order_number,
      items: order.items || [],
    });
    cancelledNoticeTimerRef.current = setTimeout(() => {
      setCancelledNotice(null);
      cancelledNoticeTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (cancelledNoticeTimerRef.current) clearTimeout(cancelledNoticeTimerRef.current);
  }, []);

  // Ticking clock for the elapsed-time readout on each active order card.
  // Only ticks while there is something to show — avoids re-rendering the
  // whole screen every second when the queue is empty.
  const [now, setNow] = useState(() => Date.now());
  const hasActiveOrders = activeOrders.some((o) => !o.ready);
  useEffect(() => {
    if (!hasActiveOrders) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveOrders]);

  // Pulsing live dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isOpen) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOpen, pulse]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [shopRes, ordersRes] = await Promise.all([
        shopApi.getMyShop().catch(() => null),
        shopApi.getMyOrders(),
      ]);
      if (!mountedRef.current) return;
      if (shopRes?.shop && !toggleInFlightRef.current) {
        setIsOpen(Boolean(shopRes.shop.isOpen));
        setOpenTime(shopRes.shop.openTime || null);
        setCloseTime(shopRes.shop.closeTime || null);
      }

      const orders = ordersRes.orders || [];
      setActiveOrders(orders.filter(o => o.confirmed && !o.rejected));
      // One-at-a-time popup queue: keep existing order, append new ones
      // oldest-first so the first arrived stays on screen until Accept/Reject.
      setPendingQueue(prev => {
        const incoming = orders
          .filter(o => !o.confirmed && !o.rejected)
          .slice()
          .sort((a, b) => Number(a.id) - Number(b.id));
        const stillPendingIds = new Set(incoming.map(o => o.id));
        const kept = prev.filter(o => stillPendingIds.has(o.id));
        const keptIds = new Set(kept.map(o => o.id));
        const fresh = incoming.filter(o => !keptIds.has(o.id));
        return [...kept, ...fresh];
      });
      setLoadError(false);
    } catch (_) {
      if (mountedRef.current) setLoadError(true);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  // Latest pending head for background alarm (socket may fire while Home).
  const pendingHeadRef = useRef(null);
  pendingHeadRef.current = pendingQueue[0] || null;

  /**
   * When the shop app is backgrounded, FCM data-only often never reaches Metro
   * (headless JS logs only in logcat) and ColorOS may drop audio. Socket is
   * still connected — ring the full notifee + media alarm from the main JS
   * context so the owner hears it.
   */
  const ringBackgroundShopAlarm = useCallback((payload = {}) => {
    if (Platform.OS !== 'android') return;
    if (AppState.currentState === 'active') return;
    const head = pendingHeadRef.current;
    const orderId = payload?.orderId ?? payload?.order_id ?? head?.id;
    const orderNumber =
      payload?.orderNumber
      ?? payload?.order_number
      ?? head?.orderNumber
      ?? head?.order_number
      ?? '';
    console.warn(
      '[orderAlarm] socket/bg ring shop order',
      orderId,
      orderNumber,
      'appState=',
      AppState.currentState,
    );
    displayAlarmNotification({
      alertType: 'new_order_alarm',
      type: 'shop_order',
      orderId: orderId != null ? String(orderId) : '',
      orderNumber: orderNumber != null ? String(orderNumber) : '',
      // Lets the floating card draw the payout straight away instead of
      // blank — the FCM path has no per-shop total to send.
      total: String(head?.shopTotal ?? head?.shop_total ?? ''),
    }).catch((err) => {
      console.warn('[orderAlarm] socket/bg ring failed:', err?.message || err);
    });
  }, []);

  useEffect(() => {
    // shop.order.updated: admin confirm/ready/reject, rider Out for Delivery /
    // Delivered, or cancel — refetch so Active list + Accept popup stay live.
    // shop.order.cancelled: admin cancelled whole order.
    const dropOrder = (payload, { cancelled = false } = {}) => {
      const orderId = payload?.orderId ?? payload?.order_id;
      if (orderId == null) return;
      const matchId = (o) => Number(o.id) === Number(orderId);
      if (cancelled) {
        setActiveOrders((prev) => {
          const match = prev.find(matchId);
          if (match) showCancelledNotice(match);
          return prev.filter((o) => !matchId(o));
        });
        setPendingQueue((prev) => {
          const match = prev.find(matchId);
          if (match) showCancelledNotice(match);
          return prev.filter((o) => !matchId(o));
        });
      } else {
        setPendingQueue((prev) => prev.filter((o) => !matchId(o)));
        setActiveOrders((prev) => prev.filter((o) => !matchId(o)));
      }
    };
    const terminalStatuses = new Set(['Delivered', 'Cancelled', 'Out for Delivery']);
    const unsubAssigned = subscribeRealtime('shop.order.assigned', (payload) => {
      fetchAll();
      // Warm background: don't wait for FCM — socket owns the loud path.
      ringBackgroundShopAlarm(payload || {});
    });
    const unsubCancelled = subscribeRealtime('shop.order.cancelled', (payload) => {
      dropOrder(payload, { cancelled: true });
      fetchAll();
    });
    const unsubUpdated = subscribeRealtime('shop.order.updated', (payload) => {
      const status = payload?.status;
      const isCancelled = payload?.action === 'cancelled' || status === 'Cancelled';
      if (isCancelled || (status && terminalStatuses.has(status))) {
        // Optimistic remove so Active cards clear before the GET returns.
        dropOrder(payload, { cancelled: isCancelled });
      }
      fetchAll();
    });
    const unsubRiderAssigned = subscribeRealtime('shop.order.rider_assigned', () => fetchAll());
    const unsubRiderFailed = subscribeRealtime('shop.order.rider_failed', (payload) => {
      dropOrder(payload);
      fetchAll();
    });
    const unsubForeground = subscribeRealtime('lifecycle.foreground', () => fetchAll());
    const unsubReconnected = subscribeRealtime('lifecycle.reconnected', () => fetchAll());

    // Backgrounding with a popup already waiting is handled by useNewOrderAlert
    // itself (same handoff the rider hook does) — it owns the foreground-marker
    // clearing that the alarm gate needs, so duplicating it here would only
    // race it.

    return () => {
      unsubAssigned();
      unsubCancelled();
      unsubUpdated();
      unsubRiderAssigned();
      unsubRiderFailed();
      unsubForeground();
      unsubReconnected();
    };
  }, [fetchAll, ringBackgroundShopAlarm, showCancelledNotice]);

  // Prompt (once, dismissible) to enable the floating order card for when
  // another app is open and the screen is on — without it a backgrounded owner
  // gets the ring with no visible Accept/Reject surface at all, since the alarm
  // notification is deliberately silent/hidden now.
  const [overlayBannerVisible, setOverlayBannerVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
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

  // Re-checked on every focus rather than once on mount: granting it means
  // leaving for an OS settings screen and coming back, and a banner still
  // sitting there afterwards reads as broken.
  const [fullScreenBannerVisible, setFullScreenBannerVisible] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      let cancelled = false;
      (async () => {
        const dismissed = await AsyncStorage
          .getItem(FULLSCREEN_BANNER_DISMISSED_KEY)
          .catch(() => null);
        if (dismissed || cancelled) return;
        let granted = true;
        try {
          if (typeof notifee.canUseFullScreenIntent === 'function') {
            granted = await notifee.canUseFullScreenIntent();
          }
        } catch {
          // Older binary without the API — nothing to ask for.
          granted = true;
        }
        if (!cancelled) setFullScreenBannerVisible(!granted);
      })();
      return () => { cancelled = true; };
    }, []),
  );

  const requestFullScreenPermission = useCallback(() => {
    notifee.openFullScreenIntentSettings?.().catch(() => {});
  }, []);

  const dismissFullScreenBanner = useCallback(() => {
    setFullScreenBannerVisible(false);
    AsyncStorage.setItem(FULLSCREEN_BANNER_DISMISSED_KEY, '1').catch(() => {});
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

  // ── Weak-network resilience: offline banner + HTTP polling fallback ────
  // A socket can sit "connected" for up to ~30s after the underlying network
  // actually died (see the server's pingInterval/pingTimeout) — during that
  // window a new-order alarm emitted into it is silently dropped. Poll
  // GET /shop/orders on a plain interval whenever we know the socket is down
  // so a new order still surfaces without waiting on the realtime path at all.
  // Interval is deliberately short — this is the ONLY path left for an owner
  // whose socket is down, and a new order reaching them late is the single
  // most expensive failure in the whole flow. It runs only while disconnected.
  const [socketConnected, setSocketConnected] = useState(
    () => getRealtimeConnectionState().connected
  );
  useEffect(() => {
    const unsubLifecycle = subscribeRealtimeLifecycle(({ eventName }) => {
      setSocketConnected(eventName !== 'disconnected');
    });
    return unsubLifecycle;
  }, []);

  useEffect(() => {
    if (socketConnected) return undefined;
    const id = setInterval(() => fetchAll(), 5000);
    return () => clearInterval(id);
  }, [socketConnected, fetchAll]);

  // ── Repeating alert while anything is waiting in the popup queue ────
  // role: 'shop' — foreground rings the alarm tone + vibrates with no OS
  // notification (the popup below is the visible surface); backgrounding hands
  // the ring to the notifee alarm + floating overlay card. Head order (not a
  // bare boolean) so the hook can write the per-order foreground markers.
  useNewOrderAlert(pendingQueue[0] || null, { role: 'shop' });

  const currentPopupOrder = pendingQueue[0] || null;

  // Proof-of-delivery for the in-app popup path (foreground, or backgrounded
  // then foregrounded without ever hitting the killed-app FCM handler) — the
  // killed-app notifee path already acks from displayAlarmNotification.
  // Capped FIFO, not an unbounded Set: this screen can stay mounted for a
  // shop's entire shift on an always-on tablet, and an order id is only
  // ever useful here to dedupe a re-render of the SAME still-pending popup —
  // once confirmed/rejected/expired it never reappears, so nothing is lost
  // by forgetting old ids once the cap is hit.
  const ackedOrderIdsRef = useRef(new Set());
  useEffect(() => {
    if (!currentPopupOrder) return;
    const id = currentPopupOrder.id;
    const acked = ackedOrderIdsRef.current;
    if (acked.has(id)) return;
    acked.add(id);
    if (acked.size > ACKED_ORDER_IDS_CAP) {
      acked.delete(acked.values().next().value); // oldest (Set preserves insertion order)
    }
    shopApi.ackOrderAlert(id).catch(() => {});
  }, [currentPopupOrder]);

  const dequeue = useCallback((orderId) => {
    setPendingQueue(prev => prev.filter(o => o.id !== orderId));
  }, []);

  const silenceShopAlarm = useCallback(() => {
    // Media loop keeps playing until stopAlarmSound — must run on accept/reject.
    stopAlarmSound();
    cancelOrderAlarm().catch(() => {});
  }, []);

  const handleAccept = useCallback(async (orderId) => {
    silenceShopAlarm();
    const order = pendingQueue.find(o => o.id === orderId);
    await shopApi.confirmOrder(orderId);
    dequeue(orderId);
    if (order) setActiveOrders(prev => [...prev, { ...order, confirmed: true }]);
  }, [pendingQueue, dequeue, silenceShopAlarm]);

  const handleReject = useCallback(async (orderId) => {
    silenceShopAlarm();
    await shopApi.rejectOrder(orderId);
    dequeue(orderId);
  }, [dequeue, silenceShopAlarm]);

  // ── Active-order actions: Cancel / Ready ─────────────────────────────
  const [actionBusy, setActionBusy] = useState({}); // { [orderId]: 'cancel' | 'ready' }

  const handleCancelOrder = useCallback((orderId) => {
    Alert.alert(
      'Cancel order',
      'Cancel this order? The admin will be notified to reassign or contact the customer.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order', style: 'destructive', onPress: async () => {
            setActionBusy(prev => ({ ...prev, [orderId]: 'cancel' }));
            try {
              await shopApi.rejectOrder(orderId);
              setActiveOrders(prev => prev.filter(o => o.id !== orderId));
            } catch (err) {
              Alert.alert('Could not cancel order', err?.message || 'Please try again.');
            } finally {
              setActionBusy(prev => {
                const next = { ...prev };
                delete next[orderId];
                return next;
              });
            }
          },
        },
      ]
    );
  }, []);

  const handleReadyOrder = useCallback(async (orderId) => {
    setActionBusy(prev => ({ ...prev, [orderId]: 'ready' }));
    try {
      await shopApi.readyOrder(orderId);
      setActiveOrders(prev => prev.map(o => (o.id === orderId ? { ...o, ready: true } : o)));
    } catch (err) {
      Alert.alert('Could not mark ready', err?.message || 'Please try again.');
    } finally {
      setActionBusy(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  }, []);

  // ── Shop toggle ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (value) => {
    const prev = isOpen;
    toggleInFlightRef.current = true;
    setIsOpen(value); // optimistic
    setToggleBusy(true);
    try {
      await shopApi.toggleShop(value);
    } catch (err) {
      setIsOpen(prev); // rollback
      Alert.alert('Could not update shop', err?.message || 'Please try again.');
    } finally {
      toggleInFlightRef.current = false;
      setToggleBusy(false);
    }
  }, [isOpen]);

  // ── Schedule: master switch + per-boundary time pickers ─────────────
  // Enabling seeds sensible defaults (9 AM–9 PM) so the owner has something
  // to tweak instead of an empty state; disabling clears both columns, which
  // is exactly what tells shopScheduleSweeper (server-side) to leave is_open
  // alone from then on.
  const handleScheduleToggle = useCallback(async (value) => {
    const prevOpen = openTime;
    const prevClose = closeTime;
    const nextOpen = value ? (openTime || '09:00') : null;
    const nextClose = value ? (closeTime || '21:00') : null;
    setOpenTime(nextOpen);
    setCloseTime(nextClose);
    setScheduleBusy(true);
    try {
      await shopApi.updateSchedule(nextOpen, nextClose);
    } catch (err) {
      setOpenTime(prevOpen);
      setCloseTime(prevClose);
      Alert.alert('Could not update schedule', err?.message || 'Please try again.');
    } finally {
      setScheduleBusy(false);
    }
  }, [openTime, closeTime]);

  const handleTimeConfirm = useCallback(async (hhmm) => {
    const prevOpen = openTime;
    const prevClose = closeTime;
    const nextOpen = pickerField === 'open' ? hhmm : openTime;
    const nextClose = pickerField === 'close' ? hhmm : closeTime;
    setPickerField(null);
    if (nextOpen === nextClose) {
      Alert.alert('Pick different times', 'Opening and closing time cannot be the same.');
      return;
    }
    setOpenTime(nextOpen);
    setCloseTime(nextClose);
    setScheduleBusy(true);
    try {
      await shopApi.updateSchedule(nextOpen, nextClose);
    } catch (err) {
      setOpenTime(prevOpen);
      setCloseTime(prevClose);
      Alert.alert('Could not update schedule', err?.message || 'Please try again.');
    } finally {
      setScheduleBusy(false);
    }
  }, [pickerField, openTime, closeTime]);

  const renderActiveOrder = ({ item }) => {
    const busy = actionBusy[item.id];
    const isFast = item.deliveryType === 'fast' || item.delivery_type === 'fast';
    const payout = item.shopTotal ?? item.shop_total;
    const lines = item.items || [];
    return (
      <BlurView intensity={30} tint="dark" style={styles.activeCard}>
        {/* Row 1 — id + cancel. Row 2 — speed + elapsed. */}
        <View style={styles.activeCardHeader}>
          <Text style={styles.activeOrderNumber} numberOfLines={1}>
            #{item.orderNumber || item.order_number}
          </Text>
          {!item.ready && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancelOrder(item.id)}
              disabled={!!busy}
              activeOpacity={0.85}
              accessibilityLabel="Cancel order"
            >
              {busy === 'cancel' ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.cancelBtnText}>Cancel</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerChips}>
          {/* Same fast/standard badge the accept popup shows */}
          <View style={[styles.speedBadge, isFast && styles.speedBadgeFast]}>
            <AppIcon name="navigation" size={12} color="#FFFFFF" />
            <Text style={styles.chipText}>{isFast ? 'Fast' : 'Standard'}</Text>
          </View>
          {item.ready ? (
            <View style={styles.readyPill}>
              <AppIcon name="check" size={12} color="#FFFFFF" />
              <Text style={styles.chipText}>Ready</Text>
            </View>
          ) : (
            <View style={styles.elapsedChip}>
              <AppIcon name="clock" size={14} color={colors.saffron} />
              <Text style={styles.elapsedChipText}>
                {formatElapsed(item.createdAt || item.created_at, now)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.itemsPanel}>
          {lines.map((it, idx) => {
            const lineTotal = it.shopLineTotal ?? it.shop_line_total;
            const qty = Number(it.quantity) || 0;
            // Packing a multi-unit line is easier when the per-unit price is
            // visible — it is the number the owner checks against the shelf.
            const eachPrice = qty > 1 && lineTotal != null
              ? Math.round((Number(lineTotal) / qty) * 100) / 100
              : null;
            return (
              <View key={idx} style={[styles.activeItemRow, idx > 0 && styles.activeItemRowDivided]}>
                <View style={styles.qtyChip}>
                  <Text style={styles.qtyChipText}>{it.quantity}</Text>
                  <Text style={styles.qtyChipX}>×</Text>
                </View>
                <View style={styles.activeItemMain}>
                  <Text style={styles.activeItemText} numberOfLines={2}>
                    {it.productName || it.product_name}
                  </Text>
                  {eachPrice != null ? (
                    <Text style={styles.activeItemEach}>₹{eachPrice} each</Text>
                  ) : null}
                </View>
                <Text style={styles.activeItemPrice}>
                  {lineTotal != null ? `₹${lineTotal}` : ''}
                </Text>
              </View>
            );
          })}
          {payout > 0 ? (
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>You&apos;ll receive</Text>
              <Text style={styles.payoutValue}>₹{payout}</Text>
            </View>
          ) : null}
        </View>

        {/* Slide, not tap — marking ready is one-way and a stray tap while
            handing over bags would strand the order. */}
        {/* Slide, not tap — marking ready is one-way and a stray tap while
            handing over bags would strand the order. */}
        {!item.ready && (
          <View style={styles.activeActionsRow}>
            <SlideToConfirm
              label="Slide when ready"
              busy={busy === 'ready'}
              disabled={!!busy}
              onConfirm={() => handleReadyOrder(item.id)}
              height={48}
            />
          </View>
        )}
      </BlurView>
    );
  };

  const renderListHeader = useCallback(() => (
    <>
      {/* Auto open/close schedule — real frosted blur, not a faked overlay */}
      <BlurView intensity={40} tint="dark" style={styles.scheduleCard}>
        <LinearGradient
          colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={styles.scheduleSheen}
          pointerEvents="none"
        />
        <View style={styles.scheduleTopLight} pointerEvents="none" />
        <View style={styles.scheduleHeader}>
          <View style={styles.scheduleHeaderLeft}>
            <View style={styles.scheduleIconWrap}>
              <AppIcon name="clock" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleTitle}>Auto schedule</Text>
              <Text style={styles.scheduleSub}>
                {scheduleEnabled ? 'Opens and closes on its own every day' : 'Off — the toggle above stays fully manual'}
              </Text>
            </View>
          </View>
          <ShopToggle
            value={scheduleEnabled}
            onValueChange={handleScheduleToggle}
            disabled={scheduleBusy}
            size="md"
            accessibilityLabel="Toggle auto schedule"
          />
        </View>

        {scheduleEnabled && (
          <View style={styles.scheduleTimesRow}>
            <TouchableOpacity
              style={styles.timeChip}
              onPress={() => setPickerField('open')}
              activeOpacity={0.8}
              disabled={scheduleBusy}
            >
              <Text style={styles.timeChipLabel}>Opens</Text>
              <Text style={styles.timeChipValue}>{formatDisplayTime(openTime)}</Text>
            </TouchableOpacity>
            <View style={styles.scheduleArrow}>
              <AppIcon name="chevronRight" size={16} color={glass.textFaint} />
            </View>
            <TouchableOpacity
              style={styles.timeChip}
              onPress={() => setPickerField('close')}
              activeOpacity={0.8}
              disabled={scheduleBusy}
            >
              <Text style={styles.timeChipLabel}>Closes</Text>
              <Text style={styles.timeChipValue}>{formatDisplayTime(closeTime)}</Text>
            </TouchableOpacity>
          </View>
        )}
      </BlurView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active orders</Text>
        {activeOrders.length > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{activeOrders.length}</Text>
          </View>
        )}
      </View>

    </>
  ), [scheduleEnabled, handleScheduleToggle, scheduleBusy, openTime, closeTime, activeOrders.length]);

  return (
    <View style={styles.root}>
      {/* Black canvas — the default dark status-bar icons vanish on it */}
      {isScreenFocused && <StatusBar barStyle="light-content" backgroundColor="transparent" />}
      <SafeAreaView style={styles.container} edges={['top']}>
      {/* Floating capsule top bar — sits below the status bar, not merged into it */}
      <LinearGradient
        colors={[colors.brandGradientStart, colors.brandGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.greetingName} numberOfLines={1}>{shop?.name || 'My Shop'}</Text>
          </View>
          <View style={styles.headerStatusPill}>
            <Animated.View
              style={[
                styles.headerStatusDot,
                {
                  opacity: isOpen ? pulse : 0.6,
                  backgroundColor: isOpen ? colors.success100 : 'rgba(255,255,255,0.85)',
                },
              ]}
            />
            <Text style={styles.headerStatusText}>{isOpen ? 'Open' : 'Closed'}</Text>
          </View>
          <ShopToggle
            value={isOpen}
            onValueChange={handleToggle}
            activeColor="#00C853"
            disabled={toggleBusy}
            size="md"
          />
        </View>
      </LinearGradient>

      {!socketConnected && (
        <View style={styles.offlineBanner}>
          <AppIcon name="warning" size={16} color={colors.warning} />
          <Text style={styles.offlineBannerText}>
            Weak connection — checking for new orders every 15s
          </Text>
        </View>
      )}

      {overlayBannerVisible && (
        <View style={styles.overlayBanner}>
          <AppIcon name="notification" size={18} color={colors.saffron} />
          <View style={{ flex: 1 }}>
            <Text style={styles.overlayBannerTitle}>See orders over other apps</Text>
            <Text style={styles.overlayBannerText}>
              Allow VillKro to show the accept/reject card even while
              you&apos;re using another app.
            </Text>
          </View>
          <TouchableOpacity onPress={requestOverlayPermission} style={styles.overlayBannerAllow}>
            <Text style={styles.overlayBannerAllowText}>Allow</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismissOverlayBanner} hitSlop={8}>
            <AppIcon name="close" size={16} color={glass.textFaint} />
          </TouchableOpacity>
        </View>
      )}

      {fullScreenBannerVisible && (
        <View style={styles.overlayBanner}>
          <AppIcon name="notification" size={18} color={colors.saffron} />
          <View style={{ flex: 1 }}>
            <Text style={styles.overlayBannerTitle}>Show orders on the lock screen</Text>
            <Text style={styles.overlayBannerText}>
              Allow full-screen alerts so a new order wakes your phone instead
              of only ringing.
            </Text>
          </View>
          <TouchableOpacity onPress={requestFullScreenPermission} style={styles.overlayBannerAllow}>
            <Text style={styles.overlayBannerAllowText}>Allow</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismissFullScreenBanner} hitSlop={8}>
            <AppIcon name="close" size={16} color={glass.textFaint} />
          </TouchableOpacity>
        </View>
      )}

      <TimePickerModal
        visible={!!pickerField}
        title={pickerField === 'open' ? 'Opening time' : 'Closing time'}
        initialValue={pickerField === 'open' ? openTime : closeTime}
        onConfirm={handleTimeConfirm}
        onClose={() => setPickerField(null)}
      />

      {loading && activeOrders.length === 0 ? (
        <>
          {renderListHeader()}
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
        </>
      ) : activeOrders.length === 0 ? (
        <FlatList
          data={[]}
          keyExtractor={() => 'empty'}
          renderItem={null}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
          ListEmptyComponent={
            <BlurView intensity={30} tint="dark" style={styles.emptyState}>
              <View style={styles.emptyIconGlow}>
                <View style={styles.emptyIconWrap}>
                  <AppIcon name="orders" size={32} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.emptyTitle}>{loadError ? 'Could not load orders' : 'No active orders'}</Text>
              <Text style={styles.emptyText}>
                {loadError ? 'Pull down to try again.' : 'New orders appear here the moment a customer checks out.'}
              </Text>
            </BlurView>
          }
        />
      ) : (
        <FlatList
          data={activeOrders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderActiveOrder}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        />
      )}

      <NewOrderPopup
        order={currentPopupOrder}
        onAccept={handleAccept}
        onReject={handleReject}
        queueIndex={0}
        queueTotal={pendingQueue.length}
      />

      {cancelledNotice && (
        <View style={[styles.cancelledNotice, { top: 84 }]} pointerEvents="none">
          <View style={styles.cancelledNoticeIconWrap}>
            <AppIcon name="close" size={16} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cancelledNoticeTitle}>
              Order cancelled{cancelledNotice.orderNumber ? ` — #${cancelledNotice.orderNumber}` : ''}
            </Text>
            {cancelledNotice.items.length > 0 && (
              <Text style={styles.cancelledNoticeItems} numberOfLines={2}>
                {cancelledNotice.items
                  .map((it) => `${it.quantity}× ${it.productName || it.product_name}`)
                  .join(', ')}
              </Text>
            )}
          </View>
        </View>
      )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: glass.screen },
  container: { flex: 1, backgroundColor: 'transparent' },


  cancelledNotice: {
    position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.error, borderRadius: glassRadius.inner,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    ...shadows.lg,
  },
  cancelledNoticeIconWrap: {
    width: 24, height: 24, borderRadius: radius.circle, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  cancelledNoticeTitle: { color: colors.white, fontWeight: '800', fontSize: 14 },
  cancelledNoticeItems: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '500', marginTop: 2 },

  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(244,166,42,0.16)', marginHorizontal: spacing.md,
    borderRadius: glassRadius.inner, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 3,
    marginBottom: spacing.xs, borderWidth: 1, borderColor: 'rgba(244,166,42,0.35)',
  },
  offlineBannerText: { color: '#FFD79A', fontSize: 12, fontWeight: '600', flexShrink: 1 },

  overlayBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: glass.tint, marginHorizontal: spacing.md,
    borderRadius: glassRadius.inner, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: glass.borderWarm,
  },
  overlayBannerTitle: { fontWeight: '800', fontSize: 13, color: glass.text },
  overlayBannerText: { fontSize: 12, color: glass.textDim, marginTop: 2, lineHeight: 16 },
  overlayBannerAllow: {
    backgroundColor: colors.saffron, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  overlayBannerAllowText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  header: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  greeting: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: 'rgba(0,0,0,0.55)',
  },
  greetingName: {
    ...typography.display,
    color: '#000000',
    fontWeight: '800',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.5,
  },
  headerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: '#2A2A30',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  headerStatusDot: { width: 7, height: 7, borderRadius: radius.circle },
  headerStatusText: { fontSize: 11, fontWeight: '800', color: colors.textInverse },

  /* Auto schedule — frosted glass pane */
  scheduleCard: {
    marginBottom: spacing.md,
    borderRadius: glassRadius.card,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderTopColor: 'rgba(255,255,255,0.25)',
    borderLeftColor: 'rgba(255,255,255,0.16)',
    padding: spacing.md + 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#FF7A3A', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28, shadowRadius: 24,
      },
      android: {},
    }),
  },
  scheduleSheen: { ...StyleSheet.absoluteFillObject },
  scheduleTopLight: {
    position: 'absolute', top: 0, left: 26, right: 26, height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 1,
  },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scheduleHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  scheduleIconWrap: {
    width: 42, height: 42, borderRadius: radius.circle,
    backgroundColor: '#FF7A3A',
    borderWidth: 1, borderColor: '#E05A1A',
    borderTopColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  scheduleTitle: { ...typography.label, color: glass.text, fontWeight: '800' },
  scheduleSub: { fontSize: 12, color: glass.textDim, marginTop: 1, fontWeight: '500' },
  scheduleTimesRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  timeChip: {
    flex: 1, backgroundColor: '#3A3A42',
    borderRadius: glassRadius.inner, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  timeChipLabel: { fontSize: 11, color: glass.textDim, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  timeChipValue: { fontSize: 16, color: glass.text, fontWeight: '800', marginTop: 2 },
  scheduleArrow: { paddingHorizontal: spacing.xs },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: {
    ...typography.labelSmall, fontSize: 13, color: glass.textDim, textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countPill: {
    marginLeft: spacing.sm, backgroundColor: colors.saffron, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 2, minWidth: 24, alignItems: 'center',
  },
  countPillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl + spacing.xxl },

  /* Active order — flat glass pane, three stacked blocks */
  activeCard: {
    backgroundColor: 'rgba(255,255,255,0.26)', borderRadius: glassRadius.card,
    marginBottom: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden', padding: spacing.md + 2,
    ...glassShadow,
  },
  activeCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, minHeight: 30,
  },
  activeOrderNumber: {
    ...typography.h3, flexShrink: 1, minWidth: 0, fontSize: 16, lineHeight: 22, color: glass.text,
  },
  headerChips: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.md,
  },
  cancelBtn: {
    height: 30, paddingHorizontal: 16, borderRadius: radius.pill, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#B3211F',
  },
  cancelBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  chipText: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  elapsedChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    height: 26, flexShrink: 0, minWidth: 86,
    backgroundColor: '#1E1E24', borderRadius: radius.pill, paddingHorizontal: 8,
  },
  elapsedChipText: {
    color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  speedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, flexShrink: 0,
    backgroundColor: colors.info, borderRadius: radius.pill, paddingHorizontal: 8,
  },
  speedBadgeFast: { backgroundColor: colors.saffron },
  readyPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    height: 26, minWidth: 86,
    backgroundColor: '#2563EB', borderRadius: radius.pill, paddingHorizontal: 8,
  },

  /* Items + payout share one panel — the money is the last line of the bill */
  itemsPanel: {
    backgroundColor: '#3A3A42', borderRadius: glassRadius.inner,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.sm + 2, overflow: 'hidden',
  },
  activeItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  activeItemRowDivided: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  qtyChip: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    backgroundColor: colors.saffron, borderRadius: radius.lg, paddingHorizontal: 8,
    paddingVertical: 4, marginRight: spacing.sm, minWidth: 40,
  },
  qtyChipText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  qtyChipX: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 11, marginLeft: 1 },
  activeItemMain: { flex: 1, minWidth: 0 },
  activeItemText: { ...typography.body, color: glass.text, fontWeight: '600', lineHeight: 20 },
  activeItemEach: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  activeItemPrice: {
    ...typography.body, color: glass.text, fontWeight: '800',
    minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'], marginLeft: spacing.sm,
  },
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: -(spacing.sm + 2),
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm + 2,
    backgroundColor: '#0C6B43',
  },
  payoutLabel: {
    fontSize: 11, fontWeight: '800', color: '#FFFFFF',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  payoutValue: {
    fontSize: 18, fontWeight: '900', color: '#FFFFFF', fontVariant: ['tabular-nums'],
  },

  activeActionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },

  emptyState: {
    alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl,
    marginTop: spacing.sm, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: glassRadius.card,
    borderWidth: 1, borderColor: glass.border, overflow: 'hidden', ...glassShadow,
  },
  emptyIconGlow: {
    width: 100, height: 100, borderRadius: radius.circle,
    backgroundColor: 'rgba(255,122,58,0.14)',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  emptyIconWrap: {
    width: 76, height: 76, borderRadius: radius.circle, backgroundColor: '#FF7A3A',
    borderWidth: 1, borderColor: '#E05A1A',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...typography.h3, color: glass.text },
  emptyText: {
    ...typography.body, color: glass.textDim, textAlign: 'center', marginTop: spacing.xs,
    lineHeight: 20, maxWidth: 260,
  },
});
