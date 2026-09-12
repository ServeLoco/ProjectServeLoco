import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeModules,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, radius, shadows, typography } from '../../theme';
import { riderApi } from '../../api';
import {
  ensureBackgroundCustomerToken,
  cancelRiderOfferAlarm,
} from '../../utils/orderAlarmNotifications';
import { hideOverlayOfferCard, openMainApp } from '../../utils/overlayOfferCard';
import {
  remainingSecondsFromExpiresAt,
  formatCountdown,
} from '../../utils/riderOfferTime';

const { AlarmActivityBridge } = NativeModules;

function closeActivity() {
  try {
    AlarmActivityBridge?.finish();
  } catch { /* ignore */ }
}

/**
 * Root component rendered ONLY inside the native AlarmActivity (see
 * index.js's AppRegistry.registerComponent('alarm', ...) and
 * AlarmActivity.kt) — the lock-screen-capable twin of the main app that
 * boots straight into this instead of the full nav stack. Deliberately
 * minimal: order # + total + Accept/Reject only, no map, no item list —
 * fetches the live offer itself since the activity only ever launches
 * because a real pending offer exists server-side.
 */
export default function RiderAlarmScreen() {
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    // This activity launching means the full-screen path won the race —
    // tear down the floating overlay card so both can't show at once (some
    // OEM/whitelisted-app combos auto-launch this even while unlocked).
    hideOverlayOfferCard();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBackgroundCustomerToken();
      try {
        const res = await riderApi.getActiveOffer();
        if (!mountedRef.current) return;
        const first = Array.isArray(res?.offers) ? res.offers[0] : res?.offer;
        setOffer(first || null);
      } catch {
        if (mountedRef.current) setOffer(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!offer) return undefined;
    const expiresAt = offer.expiresAt || offer.expires_at;
    const tick = () => setSecondsLeft(remainingSecondsFromExpiresAt(expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer]);

  useEffect(() => {
    if (!loading && !offer) {
      // Offer already resolved elsewhere (accepted/rejected/expired) by the
      // time this activity got a chance to render — nothing to show.
      const id = setTimeout(closeActivity, 1500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [loading, offer]);

  const respond = useCallback(async (action) => {
    if (!offer) return;
    const id = offer.id || offer.offerId;
    setBusy(action);
    try {
      if (action === 'accept') {
        await riderApi.acceptOffer(id);
      } else {
        await riderApi.rejectOffer(id);
      }
    } catch { /* best-effort — still close, dashboard will reconcile on open */ }
    await cancelRiderOfferAlarm();
    // Accept lands the rider in the app on the delivery they just took;
    // reject just closes this card and leaves the phone as it was.
    if (action === 'accept') {
      openMainApp();
    }
    closeActivity();
  }, [offer]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={colors.saffron} size="large" />
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.screen}>
        <Text style={styles.doneText}>Offer no longer available</Text>
      </View>
    );
  }

  const total = offer.total;
  const orderNumber = offer.orderNumber || offer.order_number;

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>Delivery offer</Text>
          <Text style={styles.timer}>{formatCountdown(secondsLeft)}</Text>
        </View>
        {total != null ? <Text style={styles.total}>₹{Number(total).toFixed(0)}</Text> : null}
        {orderNumber ? <Text style={styles.orderNumber}>Order #{orderNumber}</Text> : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            activeOpacity={0.85}
            disabled={busy !== null}
            onPress={() => respond('reject')}
          >
            {busy === 'reject' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.actionBtnText}>Reject</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            activeOpacity={0.85}
            disabled={busy !== null || secondsLeft <= 0}
            onPress={() => respond('accept')}
          >
            {busy === 'accept' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.actionBtnText}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  doneText: { ...typography.body, color: colors.textSecondary },
  card: {
    width: '100%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    ...shadows.cardRaised,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.saffronDark,
    backgroundColor: colors.saffronLight,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  timer: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  total: {
    fontWeight: '800',
    fontSize: 40,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  actionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: { backgroundColor: colors.error },
  acceptBtn: { backgroundColor: colors.btnInfoEnd },
  actionBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 16 },
});
