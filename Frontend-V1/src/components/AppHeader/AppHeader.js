import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { colors, typography, radius, shadows, layout } from '../../theme';

/**
 * AppHeader
 *
 * Props:
 *   title         - header title string
 *   onBack        - if provided, renders a back button on the left
 *   rightActions  - array of { icon: ReactNode, onPress, label } for right side
 *   cartCount     - if > 0, renders cart icon button with badge
 *   onCartPress   - handler for cart icon press
 *   style         - additional container style
 *   titleStyle    - additional title style
 *   bg            - background color (default: colors.bgSurface)
 *   bordered      - show bottom border (default: true)
 */
function AppHeader({
  title,
  onBack,
  rightActions = [],
  cartCount = 0,
  onCartPress,
  style,
  titleStyle,
  bg = colors.bgSurface,
  bordered = true,
}) {
  const badgeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (cartCount > 0) {
      badgeScale.setValue(1.3);
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }).start();
    }
  }, [cartCount, badgeScale]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bg },
        bordered && styles.bordered,
        style,
      ]}
    >
      {/* Left: back button */}
      <View style={styles.side}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backArrow}>{'<'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Center: title */}
      <Text
        style={[styles.title, titleStyle]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {title}
      </Text>

      {/* Right: custom actions + optional cart */}
      <View style={[styles.side, styles.rightSide]}>
        {rightActions.map((action, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={action.onPress}
            style={styles.iconBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={action.label || 'Action'}
          >
            {action.icon}
          </TouchableOpacity>
        ))}

        {onCartPress !== undefined && (
          <TouchableOpacity
            onPress={onCartPress}
            style={styles.iconBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Cart"
          >
            {/* Cart icon placeholder — replaced by icon library in later tasks */}
            <View style={styles.cartIconWrap}>
              <Text style={styles.cartIcon}>Cart</Text>
              {cartCount > 0 && (
                <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
                  <Text style={styles.badgeText}>
                    {cartCount > 99 ? '99+' : String(cartCount)}
                  </Text>
                </Animated.View>
              )}
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.headerPaddingH,
    ...shadows.navBar,
  },
  bordered: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  side: {
    width: 72,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSide: {
    justifyContent: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  iconBtn: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cartIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartIcon: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.pill,
    minWidth: layout.badgeSize,
    height: layout.badgeSize,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bgSurface,
  },
  badgeText: {
    ...typography.caption,
    color: colors.badgeText,
    fontWeight: '700',
    fontSize: 10,
  },
});

export default AppHeader;
