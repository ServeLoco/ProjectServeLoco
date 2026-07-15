import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import { useCartStore } from '../../stores';
import {
  buildProgressHintText,
  freeDeliveryUnlockPercent,
  isFreeDeliveryUnlocked,
  liveFreeDeliveryProgress,
} from '../../utils';
import PressableScale from '../PressableScale';
import AppIcon from '../AppIcon';

/**
 * StickyMiniCart
 * Floating bar that appears at the bottom when cart has items.
 *
 * Props:
 *   itemCount   - number of items in cart
 *   total       - estimated total (display only, backend verifies on checkout)
 *   onPress     - tap to open Cart screen
 *   visible     - controls visibility (parent animates show/hide)
 *   style       - container style
 *   aboveTabBar - when true, sit ABOVE the floating bottom tab bar (used on
 *                 tab screens like Home). When false (default), sit at the
 *                 very bottom where the tab bar would be (used on stack
 *                 screens like ProductList / Categories that have no tab bar).
 */
function StickyMiniCart({ itemCount = 0, total, totalAmount, onPress, visible = true, style, aboveTabBar = false }) {
  const insets = useSafeAreaInsets();
  const cartTotal = Number(total ?? totalAmount ?? 0);
  const displayTotal = Number.isFinite(cartTotal)
    ? (Number.isInteger(cartTotal) ? cartTotal.toFixed(0) : cartTotal.toFixed(2))
    : '0';

  // Server progress from cart/calculate + live recompute from local cart so
  // "Add ₹X more for FREE delivery" tracks +/− on Home without waiting for
  // the user to open Cart.
  const storedProgress = useCartStore((s) => s.freeDeliveryProgress);
  const freeDeliveryUnlockedFlag = useCartStore((s) => s.freeDeliveryUnlocked);
  const cartItems = useCartStore((s) => s.items);

  const { localSubtotal, localItemCount } = useMemo(() => {
    let subtotal = 0;
    let count = 0;
    for (const item of cartItems || []) {
      const qty = Number(item?.quantity) || 0;
      const price = Number(item?.variant?.price ?? item?.product?.price) || 0;
      subtotal += price * qty;
      count += qty;
    }
    return { localSubtotal: subtotal, localItemCount: count };
  }, [cartItems]);

  // Prefer prop totals when parent already computed them (same math).
  const subtotalForProgress = Number.isFinite(cartTotal) && cartTotal > 0
    ? cartTotal
    : localSubtotal;
  const itemCountForProgress = itemCount > 0 ? itemCount : localItemCount;

  const liveProgress = useMemo(
    () => liveFreeDeliveryProgress(storedProgress, subtotalForProgress, itemCountForProgress),
    [storedProgress, subtotalForProgress, itemCountForProgress],
  );

  const unlocked = isFreeDeliveryUnlocked(storedProgress, liveProgress, freeDeliveryUnlockedFlag);
  const showFreeDeliveryHint = Boolean(liveProgress) || unlocked;
  const unlockPercent = unlocked
    ? 100
    : freeDeliveryUnlockPercent(liveProgress || storedProgress, subtotalForProgress, itemCountForProgress);

  const isVisible = visible && itemCount > 0;
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const progress = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const barFill = useRef(new Animated.Value(0)).current;
  const prevCount = useRef(itemCount);

  // Effective visibility — hide entirely while the keyboard is up so the
  // popup stays docked at its resting position above the tab bar instead of
  // fighting fragile keyboard-height math across iOS / Android / iPad split.
  const effectiveVisible = isVisible && !keyboardVisible;

  useEffect(() => {
    if (effectiveVisible) {
      setShouldRender(true);
    }

    Animated.spring(progress, {
      toValue: effectiveVisible ? 1 : 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !effectiveVisible) {
        setShouldRender(false);
      }
    });
  }, [effectiveVisible, progress]);

  // Animate the free-delivery track fill (width %).
  useEffect(() => {
    if (!showFreeDeliveryHint) {
      barFill.setValue(0);
      return;
    }
    Animated.spring(barFill, {
      toValue: unlockPercent,
      friction: 8,
      tension: 60,
      useNativeDriver: false,
    }).start();
  }, [unlockPercent, showFreeDeliveryHint, barFill]);

  // Hide the cart when the keyboard opens. Only wired on tab screens (Home)
  // since stack screens (ProductList, Categories) don't have the bottom tab
  // bar overlap that the original logic was guarding against.
  useEffect(() => {
    if (!aboveTabBar) return undefined;
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [aboveTabBar]);

  useEffect(() => {
    if (itemCount > 0 && prevCount.current !== itemCount) {
      badgeScale.setValue(0.78);
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 4,
        tension: 150,
        useNativeDriver: true,
      }).start();
    }

    prevCount.current = itemCount;
  }, [badgeScale, itemCount]);

  if (!shouldRender) return null;

  const hintLabel = unlocked
    ? 'Free delivery unlocked'
    : buildProgressHintText(liveProgress, { suffix: ' for FREE delivery' });

  // Entrance is opacity-only (no translateY/scale transform) — a transform on
  // this container would move the Pressable's actual hit-test bounds with it,
  // so a real tap landing while the spring is still mid-flight (very common:
  // users tap the instant the bar appears) would miss the still-in-transit
  // touch target and silently do nothing, requiring a second tap once the
  // animation settles. Opacity doesn't move the hit box, so the first tap
  // always lands where the bar is visually shown.
  return (
    <Animated.View
      pointerEvents={effectiveVisible ? 'auto' : 'none'}
      style={[
        styles.container,
        // Resting position only — above the tab bar on tab screens
        // (62 content height + system inset + 12 gap), or above the system
        // navigation bar on stack screens that have no tab bar. The popup hides
        // entirely while the keyboard is open (see effectiveVisible above).
        {
          bottom: aboveTabBar ? 62 + insets.bottom + 12 : 16 + insets.bottom,
        },
        {
          opacity: progress,
        },
        style,
      ]}
    >
      <PressableScale
        onPress={onPress}
        style={styles.bar}
        scaleTo={0.96}
        accessibilityRole="button"
        accessibilityLabel={
          showFreeDeliveryHint
            ? `View cart, ${itemCount} item${itemCount !== 1 ? 's' : ''}, ${hintLabel}`
            : `View cart, ${itemCount} item${itemCount !== 1 ? 's' : ''}`
        }
      >
        <View style={styles.barInner}>
          {/* Left: total price, free-delivery nudge under it */}
          <Animated.View style={[styles.textContainer, { transform: [{ scale: badgeScale }] }]}>
            <Text style={styles.total} numberOfLines={1}>
              <Text style={styles.totalLabel}>Total </Text>₹{displayTotal}
            </Text>
            {showFreeDeliveryHint && hintLabel ? (
              <Text
                style={[styles.hintText, unlocked && styles.hintTextUnlocked]}
                numberOfLines={1}
              >
                {hintLabel}
              </Text>
            ) : null}
          </Animated.View>

          {/* Right: compact saffron "View Cart" pill button */}
          <View style={styles.viewCartPill}>
            <Text style={styles.title}>View Cart</Text>
            <AppIcon name="chevronRight" size={12} color="#FFFFFF" />
          </View>
        </View>

        {/* Status progress track inside the pill card */}
        {showFreeDeliveryHint ? (
          <View style={styles.progressTrack} accessibilityElementsHidden>
            <Animated.View
              style={[
                styles.progressFill,
                unlocked && styles.progressFillUnlocked,
                {
                  width: barFill.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            />
          </View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // `bottom` is set inline based on the aboveTabBar prop.
    left: layout.stickyCartMarginH,
    right: layout.stickyCartMarginH,
    zIndex: 999,
    ...shadows.xl,
  },
  hintText: {
    ...typography.labelSmall,
    color: '#FFC876',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  hintTextUnlocked: {
    color: '#7DFFB3',
  },
  bar: {
    backgroundColor: '#1A1A1A',
    borderRadius: radius.pill,
    minHeight: 62,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  title: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  total: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  totalLabel: {
    ...typography.labelSmall,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    fontSize: 12,
  },
  viewCartPill: {
    backgroundColor: colors.saffron,
    borderRadius: radius.pill,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 3,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: spacing.xs,
    marginHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.saffron,
  },
  progressFillUnlocked: {
    backgroundColor: '#3DDC97',
  },
});

export default React.memo(StickyMiniCart);
