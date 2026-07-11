import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';
import { riderApi, subscribeRealtime } from '../../api';
import ShopToggle from '../../components/shop/ShopToggle';
import AppIcon from '../../components/AppIcon';
import { useRiderOfferAlert } from '../../hooks/useRiderOfferAlert';
import RiderOfferPopup from './RiderOfferPopup';

const HEARTBEAT_MS = 35_000;

/**
 * Rider dashboard: online toggle, offer popup (server timer), active job actions.
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

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const me = await riderApi.getMe();
      if (!mountedRef.current) return;
      if (me?.rider) {
        setRider(me.rider);
        setIsOnline(Boolean(me.rider.isOnline || me.rider.is_online));
      }
      // Prefer dedicated offer endpoint for shops list
      let offer = me?.activeOffer || me?.active_offer || null;
      try {
        const offerRes = await riderApi.getActiveOffer();
        if (offerRes?.offer) offer = offerRes.offer;
      } catch (_) { /* keep me.offer */ }
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

  // Heartbeat while online (and on foreground resume)
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

  // Socket: offer created / expired / revoked + assignment updates
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
        // Rehydrate full offer (address/shops)
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
    setToggleBusy(true);
    try {
      const res = await riderApi.setOnline(next);
      if (res?.rider) setRider(res.rider);
      setIsOnline(next);
      await fetchAll();
    } catch (err) {
      Alert.alert('Could not update status', err?.message || 'Try again');
    } finally {
      setToggleBusy(false);
    }
  }, [fetchAll, setRider]);

  const handleLogout = useCallback(async () => {
    try {
      if (isOnlineRef.current) {
        await riderApi.setOnline(false).catch(() => {});
      }
    } finally {
      logout();
    }
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Rider mode</Text>
          <Text style={styles.title}>{rider?.displayName || rider?.display_name || 'Rider'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} hitSlop={12}>
          <AppIcon name="logout" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>You are {isOnline ? 'online' : 'offline'}</Text>
            <Text style={styles.cardSub}>
              {isOnline
                ? 'Eligible for new delivery offers'
                : 'Go online to receive order offers'}
            </Text>
          </View>
          <ShopToggle
            value={isOnline}
            onValueChange={handleToggle}
            disabled={toggleBusy || loading || Boolean(assignment)}
            activeColor={colors.success}
          />
        </View>
        {assignment ? (
          <Text style={styles.busyNote}>Stay on this job before going offline.</Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {assignment ? (
            <View style={styles.card}>
              <Text style={styles.jobBadge}>Active delivery</Text>
              <Text style={styles.orderNum}>
                #{assignment.orderNumber || assignment.order_number}
              </Text>
              <Text style={styles.statusLine}>{status}</Text>
              {assignment.address ? (
                <Text style={styles.address}>{assignment.address}</Text>
              ) : null}
              {(assignment.customerName || assignment.customer_name) ? (
                <Text style={styles.customer}>
                  {assignment.customerName || assignment.customer_name}
                </Text>
              ) : null}

              <View style={styles.jobActions}>
                {phone ? (
                  <ActionBtn
                    label="Call"
                    icon="phone"
                    onPress={() => Linking.openURL(`tel:${phone}`)}
                  />
                ) : null}
                {!pickedUp && status !== 'Out for Delivery' && status !== 'Delivered' ? (
                  <ActionBtn
                    label="Picked up"
                    icon="check"
                    primary
                    busy={actionBusy === 'picked_up'}
                    onPress={handlePickedUp}
                  />
                ) : null}
                {status !== 'Out for Delivery' && status !== 'Delivered' ? (
                  <ActionBtn
                    label="Out for delivery"
                    icon="navigation"
                    primary
                    busy={actionBusy === 'ofd'}
                    onPress={handleOutForDelivery}
                  />
                ) : null}
                {status === 'Out for Delivery' ? (
                  <ActionBtn
                    label="Delivered"
                    icon="check"
                    primary
                    busy={actionBusy === 'delivered'}
                    onPress={handleDelivered}
                  />
                ) : null}
                {!pickedUp && status !== 'Out for Delivery' && status !== 'Delivered' ? (
                  <ActionBtn
                    label="Cancel job"
                    icon="close"
                    danger
                    busy={actionBusy === 'cancel'}
                    onPress={handleCancelAssignment}
                  />
                ) : null}
              </View>
            </View>
          ) : !activeOffer ? (
            <View style={styles.empty}>
              <AppIcon name="orders" size={36} color={colors.grey300} />
              <Text style={styles.emptyTitle}>No active job</Text>
              <Text style={styles.emptySub}>
                Stay online. New offers appear as a popup when selected.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptySub}>Respond to the offer popup…</Text>
            </View>
          )}
        </ScrollView>
      )}

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

function ActionBtn({ label, icon, onPress, primary, danger, busy }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        primary && styles.actionBtnPrimary,
        danger && styles.actionBtnDanger,
      ]}
      onPress={onPress}
      disabled={Boolean(busy)}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.textInverse : colors.textPrimary} />
      ) : (
        <>
          <AppIcon
            name={icon}
            size={16}
            color={primary ? colors.textInverse : danger ? colors.error : colors.textPrimary}
          />
          <Text
            style={[
              styles.actionBtnText,
              primary && styles.actionBtnTextPrimary,
              danger && styles.actionBtnTextDanger,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  title: { ...typography.h2, color: colors.textPrimary, marginTop: 2 },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { ...typography.bodyBold, color: colors.textPrimary },
  cardSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  busyNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  body: { flex: 1 },
  error: { color: colors.error, margin: spacing.lg },
  empty: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { ...typography.bodyBold, color: colors.textPrimary, marginTop: spacing.md },
  emptySub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  jobBadge: {
    ...typography.caption,
    color: colors.saffron,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  orderNum: { ...typography.h2, color: colors.textPrimary },
  statusLine: { ...typography.bodyBold, color: colors.textSecondary, marginTop: 4 },
  address: { ...typography.body, color: colors.textPrimary, marginTop: spacing.md },
  customer: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  jobActions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
  },
  actionBtnPrimary: {
    backgroundColor: colors.saffron,
    borderColor: colors.saffron,
  },
  actionBtnDanger: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
  actionBtnText: { fontWeight: '800', fontSize: 15, color: colors.textPrimary },
  actionBtnTextPrimary: { color: colors.textInverse },
  actionBtnTextDanger: { color: colors.error },
});
