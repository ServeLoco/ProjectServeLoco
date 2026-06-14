import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, typography, layout } from '../../theme';

/**
 * TextButton
 * Text-only pressable — for secondary actions like "Forgot password", "View all", etc.
 *
 * Props:
 *   label      - button text
 *   onPress    - press handler
 *   color      - text color (default: colors.primary)
 *   size       - 'lg' | 'md' | 'sm'
 *   disabled   - disabled state
 *   style      - container style
 *   labelStyle - text style override
 *   align      - 'left' | 'center' | 'right'
 *   underline  - show underline decoration (default: false)
 */
function TextButton({
  label,
  onPress,
  color = colors.primary,
  size = 'md',
  disabled = false,
  style,
  labelStyle,
  align = 'center',
  underline = false,
}) {
  const textVariant =
    size === 'lg'
      ? typography.labelLarge
      : size === 'sm'
      ? typography.labelSmall
      : typography.label;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      style={[styles.base, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text
        style={[
          textVariant,
          { color: disabled ? colors.textDisabled : color, textAlign: align },
          underline && styles.underline,
          labelStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  underline: {
    textDecorationLine: 'underline',
  },
});

export default TextButton;
