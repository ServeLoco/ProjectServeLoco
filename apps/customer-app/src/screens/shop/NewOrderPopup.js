import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Modal, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Animated,
  Easing, ScrollView, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows, glass, glassRadius } from '../../theme';
import AppIcon from '../../components/AppIcon';
import SlideToConfirm from '../../components/shop/SlideToConfirm';

/**
 * NewOrderPopup
 * Bottom-sheet, non-dismissible modal for one new order at a time — same
 * slide-up-from-bottom shape as the rider offer sheet. When multiple orders
 * arrive they queue; only the head is shown until Accept/Reject, then the
 * next advances. Shows product names/quantities + delivery-time badge — no
 * prices/customer info (shop orders never carry that). Outside-tap / back
 * dismiss is a no-op.
 *
 * @param {object|null} order - front-of-queue order
 * @param {number} [queueIndex=0]
 * @param {number} [queueTotal=1]
 */
const RESPONSE_WINDOW_SEC = 600; // 10 minutes

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function NewOrderPopup({
  order,
  onAccept,
  onReject,
  queueIndex = 0,
  queueTotal = 1,
}) {
  const [busy, setBusy] = useState(null); // 'accept' | 'reject' | null
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(RESPONSE_WINDOW_SEC);

  const enter = useRef(new Animated.Value(0)).current;
  // Drives the slide-to-accept track's own countdown fill.
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!order) return;
    enter.setValue(0);
    const anim = Animated.spring(enter, {
      toValue: 1,
      damping: 24,
      stiffness: 210,
      mass: 0.9,
      overshootClamping: true,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [order?.id, enter]);

  // Reset busy/error state for each new order — otherwise a spinner or stale
  // error from the previous order carries over and permanently disables the
  // buttons for the next one in the queue.
  useEffect(() => {
    setBusy(null);
    setError(null);
  }, [order?.id]);

  // 10-minute response countdown, restarts for each new order in the queue.
  useEffect(() => {
    if (!order) return undefined;
    setSecondsLeft(RESPONSE_WINDOW_SEC);
    progressAnim.setValue(1);
    const anim = Animated.timing(progressAnim, {
      toValue: 0,
      duration: RESPONSE_WINDOW_SEC * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    const id = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => {
      anim.stop();
      clearInterval(id);
    };
  }, [order?.id, progressAnim]);

  const handleAccept = useCallback(async () => {
    setError(null);
    setBusy('accept');
    try {
      await onAccept(order.id);
    } catch (err) {
      setError(err?.message || 'Could not accept order. Try again.');
      setBusy(null);
    }
  }, [order, onAccept]);

  const handleReject = useCallback(async () => {
    setError(null);
    setBusy('reject');
    try {
      await onReject(order.id);
    } catch (err) {
      setError(err?.message || 'Could not reject order. Try again.');
      setBusy(null);
    }
  }, [order, onReject]);

  if (!order) return null;

  const isFast = order.deliveryType === 'fast' || order.delivery_type === 'fast';
  const minutes = order.expectedMinutes ?? order.expected_minutes;

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const backdropOpacity = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const countdownMin = Math.floor(secondsLeft / 60);
  const countdownSec = secondsLeft % 60;
  const countdownLabel = `${countdownMin}:${String(countdownSec).padStart(2, '0')}`;
  const countdownUrgent = secondsLeft <= 30;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => {}}>
      <View style={styles.overlayRoot}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />

          <View style={styles.badgeRow}>
            <View style={[styles.timerChip, countdownUrgent && styles.timerChipUrgent]}>
              <AppIcon name="clock" size={13} color={countdownUrgent ? glass.errorText : colors.saffron} />
              <Text style={[styles.timerChipText, countdownUrgent && styles.timerChipTextUrgent]}>
                {countdownLabel}
              </Text>
            </View>
            <View style={[styles.deliveryTypeBadge, isFast && styles.deliveryTypeBadgeFast]}>
              <AppIcon name="navigation" size={12} color="#FFFFFF" />
              <Text style={styles.deliveryTypeBadgeText}>{isFast ? 'Fast' : 'Standard'}</Text>
            </View>
            <TouchableOpacity
              style={styles.rejectPill}
              activeOpacity={0.8}
              onPress={handleReject}
              disabled={busy !== null}
            >
              {busy === 'reject' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.rejectPillText}>Reject</Text>
              )}
            </TouchableOpacity>
          </View>

          {queueTotal > 1 ? (
            <View style={styles.queueBanner}>
              <AppIcon name="orders" size={14} color={colors.saffron} />
              <Text style={styles.queueBannerText}>
                Order {Math.min(queueIndex + 1, queueTotal)} of {queueTotal}
                {queueTotal - queueIndex - 1 > 0
                  ? ` · ${queueTotal - queueIndex - 1} more waiting`
                  : ''}
              </Text>
            </View>
          ) : null}

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            <Text
              style={styles.orderNumber}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              Order #{order.orderNumber || order.order_number}
            </Text>

            {minutes != null && (
              <LinearGradient
                colors={isFast ? [colors.btnHighlightStart, colors.btnHighlightEnd] : [glass.infoFill, glass.infoFill]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.timeBadge, isFast && styles.timeBadgeFast]}
              >
                <AppIcon name="navigation" size={18} color={isFast ? '#FFFFFF' : glass.infoText} />
                <Text style={[styles.timeBadgeText, isFast && styles.timeBadgeTextFast]}>
                  {isFast ? 'Fast delivery' : 'Standard delivery'} · {minutes} min
                </Text>
              </LinearGradient>
            )}

            <Text style={styles.itemsLabel}>Items</Text>
            <View style={styles.itemsCard}>
              {(order.items || []).map((it, idx) => {
                const lineTotal = it.shopLineTotal ?? it.shop_line_total;
                return (
                  <View
                    key={idx}
                    style={[styles.itemRow, idx === (order.items || []).length - 1 && styles.itemRowLast]}
                  >
                    <View style={styles.qtyChip}>
                      <Text style={styles.qtyChipText}>{it.quantity}x</Text>
                    </View>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {it.productName || it.product_name}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {lineTotal != null ? `₹${lineTotal}` : ''}
                    </Text>
                  </View>
                );
              })}
              {(order.shopTotal ?? order.shop_total) > 0 ? (
                <View style={[styles.itemRow, styles.itemRowLast, styles.totalRow]}>
                  <Text style={styles.totalLabel}>You'll receive</Text>
                  <Text style={styles.totalValue}>₹{order.shopTotal ?? order.shop_total}</Text>
                </View>
              ) : null}
            </View>

            {error ? (
              <View style={styles.errorPill}>
                <AppIcon name="close" size={14} color={glass.errorText} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <SafeAreaView edges={['bottom']} style={styles.actionRow}>
            <SlideToConfirm
              label="Slide to accept order"
              busy={busy === 'accept'}
              disabled={busy !== null || secondsLeft <= 0}
              onConfirm={handleAccept}
              progressAnim={progressAnim}
            />
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlayDark },
  sheet: {
    maxHeight: '88%',
    backgroundColor: glass.canvas,
    borderTopLeftRadius: glassRadius.hero,
    borderTopRightRadius: glassRadius.hero,
    borderWidth: 1,
    borderColor: glass.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    ...shadows.modal,
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill,
    backgroundColor: glass.border, marginBottom: spacing.md,
  },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  timerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: glass.tint, borderRadius: radius.pill,
    borderWidth: 1, borderColor: glass.borderWarm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  timerChipUrgent: { backgroundColor: glass.errorFill, borderColor: glass.errorRim },
  timerChipText: { fontWeight: '800', fontSize: 14, color: colors.saffron, fontVariant: ['tabular-nums'] },
  timerChipTextUrgent: { color: glass.errorText },
  deliveryTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.info, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  deliveryTypeBadgeFast: { backgroundColor: colors.saffron },
  deliveryTypeBadgeText: { fontWeight: '800', fontSize: 12, color: '#FFFFFF' },

  rejectPill: {
    marginLeft: 'auto', minWidth: 74, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.error,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  rejectPillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  queueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: glass.tint, borderRadius: radius.pill,
    borderWidth: 1, borderColor: glass.borderWarm,
    paddingHorizontal: spacing.md, paddingVertical: 6, marginBottom: spacing.sm,
  },
  queueBannerText: { fontSize: 12, fontWeight: '800', color: colors.saffron },

  scrollBody: { flexGrow: 0 },

  orderNumber: { ...typography.h3, color: glass.text, marginBottom: spacing.sm },

  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    alignSelf: 'stretch', borderRadius: radius.button,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: glass.infoRim,
  },
  timeBadgeFast: { borderWidth: 0 },
  timeBadgeText: { color: glass.infoText, fontWeight: '700', fontSize: 15 },
  timeBadgeTextFast: { color: '#FFFFFF' },

  itemsLabel: {
    ...typography.labelSmall, color: glass.textDim, textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: spacing.sm,
  },
  itemsCard: {
    backgroundColor: glass.fill, borderRadius: glassRadius.inner,
    borderWidth: 1, borderColor: glass.border, paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: glass.divider,
  },
  itemRowLast: { borderBottomWidth: 0 },
  qtyChip: {
    backgroundColor: glass.tint, borderRadius: radius.lg, paddingHorizontal: 8,
    paddingVertical: 3, minWidth: 36, alignItems: 'center',
    borderWidth: 1, borderColor: glass.borderWarm,
  },
  qtyChipText: { color: colors.saffron, fontWeight: '800', fontSize: 13 },
  itemName: { flex: 1, ...typography.body, color: glass.text, fontWeight: '500' },
  itemPrice: { ...typography.body, color: glass.textDim, fontWeight: '700', minWidth: 56, textAlign: 'right' },
  totalRow: { justifyContent: 'space-between' },
  totalLabel: { ...typography.bodySmall, color: glass.textDim, fontWeight: '700' },
  totalValue: { ...typography.h4, color: glass.successText, fontWeight: '800' },

  errorPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: glass.errorFill, borderRadius: radius.pill,
    borderWidth: 1, borderColor: glass.errorRim,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, marginBottom: spacing.md,
  },
  errorText: { color: glass.errorText, fontSize: 13, fontWeight: '600', textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.lg },
});
