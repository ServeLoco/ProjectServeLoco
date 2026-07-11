import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Modal, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Animated, ScrollView, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows, motion, motionConfig } from '../../theme';
import AppIcon from '../../components/AppIcon';
import {
  remainingSecondsFromExpiresAt,
  formatCountdown,
} from '../../utils/riderOfferTime';

/**
 * RiderOfferPopup
 * Non-dismissible Accept/Reject modal. Countdown is derived from server
 * expiresAt so app restart / background does not reset the 2-minute window.
 */
export default function RiderOfferPopup({ offer, onAccept, onReject }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const enter = useRef(new Animated.Value(0)).current;
  const offerKey = offer?.id || offer?.offerId;

  useEffect(() => {
    if (!offer) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.screenMs,
      easing: motion.easingModal,
      useNativeDriver: true,
    }).start();
  }, [offerKey, enter, offer]);

  useEffect(() => {
    setBusy(null);
    setError(null);
  }, [offerKey]);

  // Tick from server expiresAt every second
  useEffect(() => {
    if (!offer) return undefined;
    const expiresAt = offer.expiresAt || offer.expires_at;
    const tick = () => setSecondsLeft(remainingSecondsFromExpiresAt(expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offerKey, offer]);

  const handleAccept = useCallback(async () => {
    setError(null);
    setBusy('accept');
    try {
      await onAccept(offer);
    } catch (err) {
      setError(err?.message || 'Could not accept. Try again.');
      setBusy(null);
    }
  }, [offer, onAccept]);

  const handleReject = useCallback(async () => {
    setError(null);
    setBusy('reject');
    try {
      await onReject(offer);
    } catch (err) {
      setError(err?.message || 'Could not reject. Try again.');
      setBusy(null);
    }
  }, [offer, onReject]);

  if (!offer) return null;

  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [motion.modalScaleStart, 1] });
  const countdownLabel = formatCountdown(secondsLeft);
  const countdownUrgent = secondsLeft <= 30;
  const shops = offer.shops || [];
  const phone = offer.phone;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.wrap}>
          <Animated.View style={[styles.sheet, { opacity: enter, transform: [{ scale }] }]}>
            <View style={styles.topAccent} />

            <View style={styles.badgeRow}>
              <View style={styles.newBadge}>
                <AppIcon name="notification" size={14} color={colors.textInverse} />
                <Text style={styles.newBadgeText}>Delivery offer</Text>
              </View>
            </View>

            <Text style={styles.orderNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              #{offer.orderNumber || offer.order_number}
            </Text>

            <View style={[styles.countdownPill, countdownUrgent && styles.countdownPillUrgent]}>
              <AppIcon name="clock" size={14} color={countdownUrgent ? colors.error : colors.textSecondary} />
              <Text style={[styles.countdownText, countdownUrgent && styles.countdownTextUrgent]}>
                {secondsLeft > 0 ? `Respond within ${countdownLabel}` : 'Time expired'}
              </Text>
            </View>

            {offer.address ? (
              <View style={styles.addressCard}>
                <AppIcon name="navigation" size={16} color={colors.saffron} />
                <Text style={styles.addressText}>{offer.address}</Text>
              </View>
            ) : null}

            {(offer.customerName || offer.customer_name) ? (
              <Text style={styles.customerLine}>
                {offer.customerName || offer.customer_name}
                {phone ? ` · ${phone}` : ''}
              </Text>
            ) : null}

            {phone ? (
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${phone}`)}
              >
                <AppIcon name="phone" size={16} color={colors.info} />
                <Text style={styles.callBtnText}>Call customer</Text>
              </TouchableOpacity>
            ) : null}

            {shops.length > 0 ? (
              <>
                <Text style={styles.itemsLabel}>Pickup shops</Text>
                <ScrollView style={styles.itemsCard} showsVerticalScrollIndicator={false}>
                  {shops.map((s) => (
                    <View key={s.id} style={styles.itemRow}>
                      <AppIcon name="box" size={14} color={colors.saffron} />
                      <Text style={styles.itemName}>{s.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {error ? (
              <View style={styles.errorPill}>
                <AppIcon name="close" size={14} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <PressButton
                label="Reject"
                variant="reject"
                busy={busy === 'reject'}
                disabled={busy !== null}
                onPress={handleReject}
              />
              <PressButton
                label="Accept"
                variant="accept"
                busy={busy === 'accept'}
                disabled={busy !== null || secondsLeft <= 0}
                onPress={handleAccept}
              />
            </View>
          </Animated.View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function PressButton({ label, variant, busy, disabled, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const isAccept = variant === 'accept';
  const handleIn = () => Animated.timing(scale, { toValue: 0.96, ...motionConfig.tap }).start();
  const handleOut = () => Animated.timing(scale, { toValue: 1, ...motionConfig.tap }).start();
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, { transform: [{ scale }], opacity: disabled ? 0.75 : 1 }]}
    >
      {isAccept ? (
        <LinearGradient
          colors={[colors.btnSuccessStart, colors.btnSuccessEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientFill}
        >
          <ButtonInner label={label} busy={busy} color={colors.textInverse} icon="check" />
        </LinearGradient>
      ) : (
        <View style={[styles.gradientFill, styles.rejectFill]}>
          <ButtonInner label={label} busy={busy} color={colors.error} icon="close" />
        </View>
      )}
    </TouchableOpacity>
  );
}

function ButtonInner({ label, busy, color, icon }) {
  if (busy) return <ActivityIndicator color={color} />;
  return (
    <View style={styles.btnInner}>
      <AppIcon name={icon} size={18} color={color} />
      <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayDark,
    justifyContent: 'center',
  },
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  sheet: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadows.modal,
  },
  topAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 6,
    backgroundColor: colors.saffron,
  },
  badgeRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  newBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.saffron, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  newBadgeText: {
    color: colors.textInverse, fontWeight: '800', fontSize: 13, letterSpacing: 0.3,
  },
  orderNumber: {
    ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm,
  },
  countdownPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  countdownPillUrgent: {},
  countdownText: {
    color: colors.textSecondary, fontWeight: '700', fontSize: 13,
  },
  countdownTextUrgent: { color: colors.error },
  addressCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.bgApp, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  addressText: { flex: 1, ...typography.body, color: colors.textPrimary, fontWeight: '500' },
  customerLine: {
    ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm,
  },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  callBtnText: { color: colors.info, fontWeight: '700', fontSize: 14 },
  itemsLabel: {
    ...typography.labelSmall, color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: spacing.sm,
  },
  itemsCard: {
    backgroundColor: colors.bgApp, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg,
    maxHeight: 120,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs,
  },
  itemName: { flex: 1, ...typography.bodyLarge, color: colors.textPrimary, fontWeight: '500' },
  errorPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.errorLight, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.md,
  },
  errorText: { color: colors.error, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1, borderRadius: radius.button, overflow: 'hidden' },
  gradientFill: {
    minHeight: 52, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center',
  },
  rejectFill: {
    borderWidth: 1.5, borderColor: colors.error, backgroundColor: colors.errorLight,
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionBtnText: { fontWeight: '800', fontSize: 16 },
});
