import React, { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import { useCartStore } from '../../stores';
import { buildProgressHintText } from '../../utils';
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
  const itemsToFreeDelivery = freeDeliveryProgress?.itemsRemaining || 0;
  const showFreeDeliveryHint = amountToFreeDelivery > 0 || itemsToFreeDelivery > 0;

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
        accessibilityLabel={`View cart, ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
      >
        {/* Left: total price, with the free-delivery nudge as a small line below it */}
        <Animated.View style={[styles.textContainer, { transform: [{ scale: badgeScale }] }]}>
          <Text style={styles.total} numberOfLines={1}>
            <Text style={styles.totalLabel}>Total </Text>₹{displayTotal}
          </Text>
          {showFreeDeliveryHint && (
            <Text style={styles.hintText} numberOfLines={1}>
              {buildProgressHintText(freeDeliveryProgress, { suffix: ' for FREE delivery' })}
            </Text>
          )}
        </Animated.View>

        {/* Right: compact saffron "View Cart" pill button */}
        <View style={styles.viewCartPill}>
          <Text style={styles.title}>View Cart</Text>
          <AppIcon name="chevronRight" size={13} color="#FFFFFF" />
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
  hintText: {
    ...typography.labelSmall,
    color: '#FFC876',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  bar: {
    backgroundColor: '#1A1A1A',
    borderRadius: radius.pill,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  title: {
    ...typography.labelLarge,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
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
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: 4,
  },
});

export default React.memo(StickyMiniCart);
