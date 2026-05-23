import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors, radius, layout } from '../../theme';
import AppIcon from '../AppIcon';

/**
 * IconButton
 * A circular/square pressable with a minimum 44px touch target.
 *
 * Props:
 *   icon          - ReactNode (any icon component)
 *   onPress       - press handler
 *   variant       - 'default' | 'filled' | 'tinted' | 'outline' | 'danger'
 *   size          - 'lg' | 'md' | 'sm'
 *   disabled      - disabled state
 *   shape         - 'circle' | 'square'
 *   bg            - custom background color
 *   style         - container style override
 *   accessibilityLabel - required for a11y
 */
function IconButton({
  icon,
  onPress,
  variant = 'default',
  size = 'md',
  disabled = false,
  shape = 'circle',
  bg,
  style,
  accessibilityLabel = 'Button',
}) {
  const btnSize = size === 'lg' ? 44 : size === 'sm' ? 32 : 40;
  const borderRadius = shape === 'circle' ? radius.circle : radius.md;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.touchTarget, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <View
        style={[
          styles.btn,
          { width: btnSize, height: btnSize, borderRadius },
          styles[variant],
          bg && { backgroundColor: bg },
          disabled && styles.disabled,
        ]}
      >
        {typeof icon === 'string' ? (
          <AppIcon
            name={icon}
            color={variant === 'filled' ? colors.primaryText : colors.textPrimary}
            size={size === 'sm' ? 16 : 20}
          />
        ) : icon}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Variants
  default: {
    backgroundColor: 'transparent',
  },
  filled: {
    backgroundColor: colors.primary,
  },
  tinted: {
    backgroundColor: colors.primaryLight,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.errorLight,
  },
  disabled: {
    opacity: 0.4,
  },
});

export default IconButton;
