import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
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
          <AppIcon name="shoppingBag" size={14} color="#FFFFFF" />
          <Text style={styles.badgeText}>{itemCount}</Text>
        </Animated.View>

        {/* Center: label text */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>View Cart</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {itemCount} item{itemCount !== 1 ? 's' : ''} added
          </Text>
        </View>

        {/* Right: estimated total */}
        <View style={styles.rightContainer}>
          <Text style={styles.total}>₹{cartTotal.toFixed(0)}</Text>
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
    bottom: layout.bottomNavHeight + layout.stickyCartMarginBottom + 12,
    left: layout.stickyCartMarginH,
    right: layout.stickyCartMarginH,
    zIndex: 999,
    ...shadows.xl,
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

export default StickyMiniCart;
