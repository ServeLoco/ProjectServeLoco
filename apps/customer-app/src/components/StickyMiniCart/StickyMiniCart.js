import React, { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import { useCartStore } from '../../stores';
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

  // Free-delivery progress hint, from the most recent cart-calculate call
  // (set by CartScreen/CheckoutScreen). Display-only and may be stale/absent;
  // the backend always re-verifies the fee and any coupon at checkout.
  const freeDeliveryProgress = useCartStore((s) => s.freeDeliveryProgress);
  const amountToFreeDelivery = freeDeliveryProgress?.amountRemaining || 0;
  const showFreeDeliveryHint = amountToFreeDelivery > 0;

  const isVisible = visible && itemCount > 0;
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const progress = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
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

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [96, 0],
  });

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <Animated.View
      pointerEvents={effectiveVisible ? 'auto' : 'none'}
      style={[
        styles.container,
        // Resting position only — above the tab bar on tab screens
        // (62 content height + system inset + 12 gap), at the bottom on stack
        // screens that have no tab bar. The popup hides entirely while the
        // keyboard is open (see effectiveVisible above).
        {
          bottom: aboveTabBar ? 62 + insets.bottom + 12 : 16,
        },
        {
          opacity: progress,
          transform: [{ translateY }, { scale }],
        },
        style,
      ]}
    >
      <PressableScale
        onPress={onPress}
        style={styles.bar}
        scaleTo={0.96}
        accessibilityRole="button"
        accessibilityLabel={`View cart, ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
      >
        {/* Left: item count badge */}
        <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
          <AppIcon name="shoppingBag" size={14} color="#FFFFFF" />
          <Text style={styles.badgeText}>{itemCount}</Text>
        </Animated.View>

        {/* Center: label text */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>View Cart</Text>
          {showFreeDeliveryHint ? (
            <Text style={styles.subtitleHint} numberOfLines={1}>
              Add ₹{amountToFreeDelivery.toFixed(0)} more for FREE delivery
            </Text>
          ) : (
            <Text style={styles.subtitle} numberOfLines={1}>
              {itemCount} item{itemCount !== 1 ? 's' : ''} added
            </Text>
          )}
        </View>

        {/* Right: estimated total */}
        <View style={styles.rightContainer}>
          <Text style={styles.total}>₹{displayTotal}</Text>
          <View style={styles.arrowIconWrapper}>
            <AppIcon name="chevronRight" size={14} color="#FFFFFF" />
          </View>
        </View>
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
  subtitleHint: {
    ...typography.labelSmall,
    color: '#FFE9A8', // warm highlight so the free-delivery nudge stands out on green
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  bar: {
    backgroundColor: colors.success || '#1FB574', // Vibrant success green instead of black
    borderRadius: radius.lg,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)', // Semi-transparent glass capsule badge
    borderRadius: radius.pill,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
    gap: 4,
  },
  badgeText: {
    ...typography.label,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  subtitle: {
    ...typography.labelSmall,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 1,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  total: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  arrowIconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)', // Matching semi-transparent circle
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(StickyMiniCart);
