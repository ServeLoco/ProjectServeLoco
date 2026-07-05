import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, borderWidth } from '../../../theme';
import { PressableScale, AppIcon } from '../../../components';
import { cartApi } from '../../../api/cartApi';

/**
 * "Expires today" / "Expires in N days" hint for a coupon's ends_at.
 * Returns null when there's no end date, or it's already in the past
 * (the backend already filters those out — this is just display-side).
 */
const formatExpiry = (endsAt) => {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;

  const now = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((endDay - nowDay) / 86400000);

  if (diffDays < 0) return null;
  if (diffDays === 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  return `Expires in ${diffDays} days`;
};

export default function CouponSheet({
  visible,
  onClose,
  subtotal,
  availableCoupons = [],
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
}) {
  const insets = useSafeAreaInsets();
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);

  // A coupon is "unlocked" once the cart's subtotal meets its minimum order.
  // Prefer the backend-computed flag (findApplicableCoupons); fall back to a
  // client-side comparison for backward compatibility with older responses
  // that don't send `unlocked`.
  const isUnlocked = useCallback((coupon) => {
    if (typeof coupon.unlocked === 'boolean') return coupon.unlocked;
    return subtotal >= Number(coupon.minOrder || 0);
  }, [subtotal]);

  // Nothing is silently hidden: every active coupon the backend returns is
  // shown somewhere. `available: false` (wrong store type, first-order-only,
  // day/time window, usage limit reached, etc.) always wins the bucket —
  // even a locked-AND-unavailable coupon goes to "Not available", since
  // adding more items to the cart alone won't fix those.
  const isAvailable = useCallback((coupon) => coupon.available !== false, []);

  // The applied coupon is no longer "available to pick" — it's excluded
  // from every bucket below and rendered in its own dedicated section
  // instead, so it disappears from the pickable list immediately.
  const isAppliedCoupon = useCallback(
    (coupon) => !!appliedCoupon && coupon.id === appliedCoupon.id,
    [appliedCoupon],
  );

  const unlockedCoupons = useMemo(
    () => availableCoupons.filter(coupon => isAvailable(coupon) && isUnlocked(coupon) && !isAppliedCoupon(coupon)),
    [availableCoupons, isAvailable, isUnlocked, isAppliedCoupon],
  );
  const lockedCoupons = useMemo(
    () => availableCoupons.filter(coupon => isAvailable(coupon) && !isUnlocked(coupon) && !isAppliedCoupon(coupon)),
    [availableCoupons, isAvailable, isUnlocked, isAppliedCoupon],
  );
  const unavailableCoupons = useMemo(
    () => availableCoupons.filter(coupon => !isAvailable(coupon) && !isAppliedCoupon(coupon)),
    [availableCoupons, isAvailable, isAppliedCoupon],
  );

  // The single highest-value unlocked offer gets a "BEST" badge, mirroring
  // the admin-side CouponPreview's AUTO/EXCLUSIVE badge treatment.
  const bestCouponId = useMemo(() => {
    if (unlockedCoupons.length < 2) return null;
    const best = unlockedCoupons.reduce(
      (acc, coupon) => (Number(coupon.discount) > Number(acc?.discount || 0) ? coupon : acc),
      null,
    );
    return best?.id ?? null;
  }, [unlockedCoupons]);

  useEffect(() => {
    if (!visible) {
      setShowManualEntry(false);
      setManualCode('');
      setManualError(null);
      setManualLoading(false);
    }
  }, [visible]);

  const handleApplyManualCode = useCallback(async () => {
    const trimmed = manualCode.trim();
    if (!trimmed) {
      setManualError('Please enter a coupon code');
      return;
    }

    setManualLoading(true);
    setManualError(null);
    try {
      const result = await cartApi.validateCoupon({ code: trimmed, subtotal });
      if (result?.ok) {
        onApplyCoupon(result.coupon.code, result.coupon);
        onClose();
      } else {
        setManualError(result?.reason || 'Invalid coupon code');
      }
    } catch (_) {
      setManualError('Could not validate this code right now. Please try again.');
    } finally {
      setManualLoading(false);
    }
  }, [manualCode, subtotal, onApplyCoupon, onClose]);

  const formatSavings = useCallback((coupon) => {
    if (Number(coupon.discount) > 0) return `Save ₹${coupon.discount}`;
    if (coupon.discountType === 'flat') return `₹${coupon.discountValue} off`;
    if (coupon.discountType === 'percent') return `${coupon.discountValue}% off`;
    if (coupon.discountType === 'free_delivery') return 'Free Delivery';
    return 'Eligible offer';
  }, []);

  const formatMinOrder = useCallback((coupon) => {
    const minOrder = Number(coupon.minOrder || 0);
    return minOrder > 0 ? `Min order ₹${minOrder}` : 'No minimum order';
  }, []);

  const handleTapCoupon = useCallback((coupon) => {
    onApplyCoupon(coupon.code || null, coupon);
  }, [onApplyCoupon]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select an Offer</Text>
              <Text style={styles.headerSubtitle}>Offers you can use now, and offers within reach</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close offers">
              <AppIcon name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {appliedCoupon && (
              <>
                <Text style={styles.listHeading}>Applied offer</Text>
                <PressableScale
                  onPress={onRemoveCoupon}
                  style={[styles.option, styles.optionSelected, styles.appliedOfferRow]}
                  scaleTo={0.99}
                  accessibilityRole="button"
                  accessibilityLabel={`${appliedCoupon.title} applied. Double tap to remove`}
                >
                  <View style={styles.selectedCheckBadge}>
                    <AppIcon name="check" size={12} color={colors.textInverse} strokeWidth={3} />
                  </View>
                  <View style={[styles.optionIconFrame, styles.optionIconFrameAuto]}>
                    <AppIcon name="ticket" size={18} color={colors.success} />
                  </View>
                  <View style={styles.optionText}>
                    <View style={styles.optionTitleRow}>
                      <Text style={[styles.optionTitle, styles.optionTitleSelected]} numberOfLines={1}>
                        {appliedCoupon.title}
                      </Text>
                      <View style={styles.appliedBadge}>
                        <Text style={styles.appliedBadgeText}>APPLIED</Text>
                      </View>
                    </View>
                    {appliedCoupon.description ? (
                      <Text style={styles.optionDescription} numberOfLines={2}>
                        {appliedCoupon.description}
                      </Text>
                    ) : null}
                    <View style={styles.optionFooterRow}>
                      <Text style={styles.optionExpiry} numberOfLines={1}>Tap to remove</Text>
                      <Text style={styles.optionSavings}>{formatSavings(appliedCoupon)}</Text>
                    </View>
                  </View>
                </PressableScale>
              </>
            )}

            {unlockedCoupons.length === 0 && lockedCoupons.length === 0 && unavailableCoupons.length === 0 ? (
              !appliedCoupon && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconFrame}>
                    <AppIcon name="box" size={28} color={colors.textTertiary} />
                  </View>
                  <Text style={styles.emptyText}>No offers available</Text>
                  <Text style={styles.emptySubtext}>
                    There are no offers available right now. Check back later!
                  </Text>
                </View>
              )
            ) : (
              <>
                {unlockedCoupons.length > 0 ? (
                  <>
                    <Text style={styles.listHeading}>Available offers</Text>
                    <ScrollView
                      style={styles.optionsList}
                      contentContainerStyle={styles.optionsContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {unlockedCoupons.map((coupon) => {
                        const isBest = bestCouponId === coupon.id;
                        const expiry = formatExpiry(coupon.endsAt);
                        return (
                          <PressableScale
                            key={coupon.id}
                            onPress={() => handleTapCoupon(coupon)}
                            style={styles.option}
                            scaleTo={0.99}
                            accessibilityRole="button"
                            accessibilityLabel={`${coupon.title}, ${formatSavings(coupon)}`}
                          >
                            <View style={[styles.optionIconFrame, coupon.autoApply && styles.optionIconFrameAuto]}>
                              <AppIcon
                                name="ticket"
                                size={18}
                                color={coupon.autoApply ? colors.success : colors.saffron}
                              />
                            </View>
                            <View style={styles.optionText}>
                              <View style={styles.optionTitleRow}>
                                <Text style={styles.optionTitle} numberOfLines={1}>
                                  {coupon.title}
                                </Text>
                                {isBest ? (
                                  <View style={styles.bestBadge}>
                                    <Text style={styles.bestBadgeText}>BEST</Text>
                                  </View>
                                ) : null}
                              </View>
                              {coupon.description ? (
                                <Text style={styles.optionDescription} numberOfLines={2}>
                                  {coupon.description}
                                </Text>
                              ) : null}
                              <View style={styles.optionFooterRow}>
                                <Text style={styles.optionExpiry} numberOfLines={1}>
                                  {expiry || formatMinOrder(coupon)}
                                </Text>
                                <Text style={styles.optionSavings}>{formatSavings(coupon)}</Text>
                              </View>
                            </View>
                          </PressableScale>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : (
                  <View style={styles.emptyStateCompact}>
                    <Text style={styles.emptyText}>No offers unlocked yet</Text>
                    <Text style={styles.emptySubtext}>
                      Add more items to your cart to unlock the offers below.
                    </Text>
                  </View>
                )}

                {lockedCoupons.length > 0 && (
                  <>
                    <Text style={[styles.listHeading, styles.lockedHeading]}>Almost there</Text>
                    <ScrollView
                      style={styles.lockedList}
                      contentContainerStyle={styles.optionsContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {lockedCoupons.map((coupon) => {
                        const remaining = Number.isFinite(coupon.amountRemaining)
                          ? coupon.amountRemaining
                          : Math.max(0, Number(coupon.minOrder || 0) - subtotal);
                        const expiry = formatExpiry(coupon.endsAt);
                        return (
                          <View
                            key={coupon.id}
                            style={styles.lockedOption}
                            accessibilityRole="text"
                            accessibilityState={{ disabled: true }}
                            accessibilityLabel={`${coupon.title}, locked, add ₹${remaining} more to unlock`}
                          >
                            <View style={styles.lockedIconFrame}>
                              <AppIcon name="ticket" size={16} color={colors.textTertiary} />
                            </View>
                            <View style={styles.optionText}>
                              <Text style={styles.lockedTitle} numberOfLines={1}>
                                {coupon.title}
                              </Text>
                              <View style={styles.optionFooterRow}>
                                <Text style={styles.optionExpiry} numberOfLines={1}>
                                  {expiry || formatMinOrder(coupon)}
                                </Text>
                                <Text style={styles.optionSavings}>{formatSavings(coupon)}</Text>
                              </View>
                              <Text style={styles.lockedCaption}>Add ₹{remaining} more to unlock</Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </>
                )}

                {unavailableCoupons.length > 0 && (
                  <>
                    <Text style={[styles.listHeading, styles.unavailableHeading]}>Not available for this order</Text>
                    <ScrollView
                      style={styles.lockedList}
                      contentContainerStyle={styles.optionsContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {unavailableCoupons.map((coupon) => (
                        <View
                          key={coupon.id}
                          style={styles.unavailableOption}
                          accessibilityRole="text"
                          accessibilityState={{ disabled: true }}
                          accessibilityLabel={`${coupon.title}, not available, ${coupon.unavailableReason}`}
                        >
                          <View style={styles.unavailableIconFrame}>
                            <AppIcon name="close" size={14} color={colors.textTertiary} />
                          </View>
                          <View style={styles.optionText}>
                            <Text style={styles.unavailableTitle} numberOfLines={1}>
                              {coupon.title}
                            </Text>
                            <Text style={styles.unavailableReason} numberOfLines={2}>
                              {coupon.unavailableReason || 'Not available for your account right now'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                )}
              </>
            )}

            <TouchableOpacity
              onPress={() => setShowManualEntry(v => !v)}
              style={styles.manualToggle}
              accessibilityRole="button"
              accessibilityLabel="Have a code? Enter manually"
            >
              <Text style={styles.manualToggleText}>
                Have a code? <Text style={styles.manualToggleLink}>Enter manually</Text>
              </Text>
            </TouchableOpacity>

            {showManualEntry && (
              <View style={styles.manualEntryRow}>
                <TextInput
                  value={manualCode}
                  onChangeText={(text) => { setManualCode(text); setManualError(null); }}
                  placeholder="Enter coupon code"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.manualInput}
                  editable={!manualLoading}
                  onSubmitEditing={handleApplyManualCode}
                  returnKeyType="done"
                />
                <PressableScale
                  onPress={handleApplyManualCode}
                  disabled={manualLoading}
                  style={[styles.manualApplyBtn, manualLoading && styles.applyBtnDisabled]}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel="Apply entered coupon code"
                >
                  {manualLoading ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={styles.manualApplyBtnText}>Apply</Text>
                  )}
                </PressableScale>
              </View>
            )}
            {showManualEntry && manualError && (
              <Text style={styles.manualErrorText}>{manualError}</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlayDark,
  },
  sheet: {
    backgroundColor: colors.bgApp,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.circle,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    ...shadows.xs,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  listHeading: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  optionsList: {
    maxHeight: 280,
  },
  optionsContent: {
    gap: spacing.sm,
  },
  option: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: colors.success,
    backgroundColor: colors.successLight,
    ...shadows.sm,
  },
  appliedOfferRow: {
    marginBottom: spacing.lg,
  },
  selectedCheckBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.circle,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.bgApp,
    zIndex: 1,
  },
  optionIconFrame: {
    width: 36,
    height: 36,
    borderRadius: radius.circle,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionIconFrameAuto: {
    backgroundColor: colors.success + '1A',
  },
  optionText: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionTitle: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
    flexShrink: 1,
  },
  optionTitleSelected: {
    color: colors.success,
  },
  bestBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.saffron,
  },
  bestBadgeText: {
    ...typography.captionMedium,
    fontSize: 10,
    color: colors.textInverse,
    fontWeight: '800',
  },
  appliedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.success,
  },
  appliedBadgeText: {
    ...typography.captionMedium,
    fontSize: 10,
    color: colors.textInverse,
    fontWeight: '800',
  },
  optionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  optionFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  optionSavings: {
    ...typography.labelSmall,
    color: colors.success,
    fontWeight: '700',
  },
  optionMinOrder: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  optionExpiry: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  applyBtnDisabled: {
    backgroundColor: colors.bgDisabled,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconFrame: {
    width: 56,
    height: 56,
    borderRadius: radius.circle,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyStateCompact: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 4,
    marginBottom: spacing.md,
  },
  lockedHeading: {
    marginTop: spacing.md,
  },
  lockedList: {
    maxHeight: 220,
  },
  lockedOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    opacity: 0.85,
  },
  lockedIconFrame: {
    width: 32,
    height: 32,
    borderRadius: radius.circle,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  lockedTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  lockedCaption: {
    ...typography.captionMedium,
    color: colors.saffronDark,
    fontWeight: '700',
    marginTop: 4,
  },
  unavailableHeading: {
    marginTop: spacing.md,
  },
  unavailableOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    opacity: 0.6,
  },
  unavailableIconFrame: {
    width: 32,
    height: 32,
    borderRadius: radius.circle,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  unavailableTitle: {
    ...typography.label,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  unavailableReason: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  manualToggle: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  manualToggleText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  manualToggleLink: {
    color: colors.saffronDark,
    fontWeight: '700',
  },
  manualEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  manualInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.textPrimary,
    ...typography.label,
  },
  manualApplyBtn: {
    minHeight: 44,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.success,
  },
  manualApplyBtnText: {
    ...typography.labelSmall,
    color: colors.textInverse,
    fontWeight: '800',
  },
  manualErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
});

