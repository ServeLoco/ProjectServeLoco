import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import PressableScale from '../PressableScale';

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
 */
function StickyMiniCart({ itemCount = 0, total, totalAmount, onPress, visible = true, style }) {
  const cartTotal = Number(total ?? totalAmount ?? 0);
  const isVisible = visible && itemCount > 0;
  const [shouldRender, setShouldRender] = useState(isVisible);
  const progress = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
    }

    Animated.spring(progress, {
      toValue: isVisible ? 1 : 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !isVisible) {
        setShouldRender(false);
      }
    });
  }, [isVisible, progress]);

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
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[
        styles.container,
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
          <Text style={styles.badgeText}>{itemCount}</Text>
        </Animated.View>

        <Text style={styles.label} numberOfLines={1}>
          {itemCount} item{itemCount !== 1 ? 's' : ''} added
        </Text>

        {/* Right: estimated total */}
        <Text style={styles.total}>Rs. {cartTotal.toFixed(0)}  &gt;</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: layout.bottomNavHeight + 28,
    left: layout.stickyCartMarginH,
    right: layout.stickyCartMarginH,
    zIndex: 999,
    elevation: 24,
    ...shadows.xl,
  },
  bar: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    minHeight: layout.stickyCartHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    borderBottomWidth: 4,
    borderBottomColor: colors.successDark,
  },
  badge: {
    backgroundColor: colors.textInverse,
    borderRadius: radius.pill,
    minWidth: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
  },
  badgeText: {
    ...typography.labelLarge,
    color: colors.successDark,
    fontWeight: '800',
  },
  label: {
    ...typography.labelLarge,
    color: colors.successText,
    flex: 1,
    fontWeight: '800',
  },
  total: {
    ...typography.labelLarge,
    color: colors.successText,
    fontWeight: '900',
    marginLeft: spacing.sm,
  },
});

export default StickyMiniCart;
