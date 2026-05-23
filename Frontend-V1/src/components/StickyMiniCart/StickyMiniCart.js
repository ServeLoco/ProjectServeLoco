import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, LayoutAnimation, UIManager, Platform } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * StickyMiniCart
 * Floating bar that appears at the bottom when cart has items.
 *
 * Props:
 *   itemCount   - number of items in cart
 *   total       - estimated total (display only — backend verified on checkout)
 *   onPress     - tap to open Cart screen
 *   visible     - controls visibility (parent animates show/hide)
 *   style       - container style
 */
function StickyMiniCart({ itemCount = 0, total = 0, onPress, visible = true, style }) {
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if ((prevCount.current === 0 && itemCount > 0) || (prevCount.current > 0 && itemCount === 0)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  if (!visible || itemCount === 0) return null;

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={styles.bar}
        accessibilityRole="button"
        accessibilityLabel={`View cart, ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
      >
        {/* Left: item count badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{itemCount}</Text>
        </View>

        <Text style={styles.label}>View Cart</Text>

        {/* Right: estimated total */}
        <Text style={styles.total}>Rs. {Number(total).toFixed(0)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: layout.stickyCartMarginBottom,
    left: layout.stickyCartMarginH,
    right: layout.stickyCartMarginH,
    ...shadows.xl,
  },
  bar: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: layout.stickyCartHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.sm,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  badgeText: {
    ...typography.label,
    color: colors.primaryText,
    fontWeight: '700',
  },
  label: {
    ...typography.labelLarge,
    color: colors.primaryText,
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  total: {
    ...typography.label,
    color: colors.primaryText,
    fontWeight: '700',
  },
});

export default StickyMiniCart;
