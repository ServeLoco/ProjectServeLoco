import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, typography, spacing, radius, layout } from '../../theme';

/**
 * Button
 *
 * Variants: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
 * Sizes:    'large' | 'md' | 'small'
 *
 * Props:
 *   label       - button text
 *   onPress     - press handler
 *   variant     - visual style (default: 'primary')
 *   size        - height variant (default: 'large')
 *   disabled    - disabled state
 *   loading     - shows spinner and disables button
 *   fullWidth   - takes full width (default: true)
 *   icon        - optional ReactNode rendered before label
 *   style       - container style override
 *   labelStyle  - text style override
 */
function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  style,
  labelStyle,
}) {
  const isDisabled = disabled || loading;
  const containerStyle = [
    styles.base,
    styles[variant],
    styles[`size_${size}`],
    isDisabled && styles[`${variant}_disabled`],
    !fullWidth && styles.inline,
    style,
  ];
  const textStyle = [
    styles.label,
    styles[`label_${variant}`],
    styles[`labelSize_${size}`],
    isDisabled && styles[`label_${variant}_disabled`],
    labelStyle,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      style={containerStyle}
      disabled={isDisabled}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.primaryText : colors.primary}
          size="small"
        />
      ) : (
        <View style={styles.inner}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text style={textStyle} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inline: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },

  // ── Size variants ────────────────────────────────
  size_large: {
    height: layout.buttonHeightLarge,
    paddingHorizontal: spacing.lg,
  },
  size_md: {
    height: layout.buttonHeightMd,
    paddingHorizontal: spacing.md,
  },
  size_small: {
    height: layout.buttonHeightSmall,
    paddingHorizontal: spacing.md,
  },

  // ── Primary ──────────────────────────────────────
  primary: {
    backgroundColor: colors.primary,
  },
  primary_disabled: {
    backgroundColor: colors.bgDisabled,
  },
  label_primary: {
    color: colors.primaryText,
  },
  label_primary_disabled: {
    color: colors.textDisabled,
  },

  // ── Secondary ────────────────────────────────────
  secondary: {
    backgroundColor: colors.primaryLight,
  },
  secondary_disabled: {
    backgroundColor: colors.bgDisabled,
  },
  label_secondary: {
    color: colors.primary,
  },
  label_secondary_disabled: {
    color: colors.textDisabled,
  },

  // ── Outline ──────────────────────────────────────
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  outline_disabled: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  label_outline: {
    color: colors.primary,
  },
  label_outline_disabled: {
    color: colors.textDisabled,
  },

  // ── Ghost ────────────────────────────────────────
  ghost: {
    backgroundColor: 'transparent',
  },
  ghost_disabled: {
    backgroundColor: 'transparent',
  },
  label_ghost: {
    color: colors.textSecondary,
  },
  label_ghost_disabled: {
    color: colors.textDisabled,
  },

  // ── Danger ───────────────────────────────────────
  danger: {
    backgroundColor: colors.error,
  },
  danger_disabled: {
    backgroundColor: colors.bgDisabled,
  },
  label_danger: {
    color: colors.textInverse,
  },
  label_danger_disabled: {
    color: colors.textDisabled,
  },

  // ── Label base & sizes ───────────────────────────
  label: {
    ...typography.button,
  },
  labelSize_large: {
    ...typography.buttonLarge,
  },
  labelSize_md: {
    ...typography.button,
  },
  labelSize_small: {
    ...typography.buttonSmall,
  },

  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: spacing.sm,
  },
});

export default Button;
