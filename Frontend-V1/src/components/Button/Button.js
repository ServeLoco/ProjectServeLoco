import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, typography, spacing, radius, layout, shadows } from '../../theme';
import PressableScale from '../PressableScale';

/**
 * Button
 *
 * Variants: 'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'highlight' | 'danger'
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
    <PressableScale
      onPress={onPress}
      style={containerStyle}
      disabled={isDisabled}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'success' || variant === 'highlight' || variant === 'danger' ? colors.primaryText : colors.primary}
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
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
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

  // ── Primary (Ink Black 3D) ────────────────────────
  primary: {
    backgroundColor: colors.primary,
    borderBottomWidth: 3,
    borderBottomColor: '#000000',
  },
  primary_disabled: {
    backgroundColor: colors.bgDisabled,
    borderBottomWidth: 0,
  },
  label_primary: {
    color: colors.primaryText,
  },
  label_primary_disabled: {
    color: colors.textDisabled,
  },

  // ── Success (Green 3D Confirm) ─────────────────────
  success: {
    backgroundColor: colors.success,
    borderBottomWidth: 3,
    borderBottomColor: colors.successDark,
  },
  success_disabled: {
    backgroundColor: colors.bgDisabled,
    borderBottomWidth: 0,
  },
  label_success: {
    color: colors.successText,
  },
  label_success_disabled: {
    color: colors.textDisabled,
  },

  // ── Highlight (Saffron 3D Offer) ───────────────────
  highlight: {
    backgroundColor: colors.saffron,
    borderBottomWidth: 3,
    borderBottomColor: colors.saffronDark,
  },
  highlight_disabled: {
    backgroundColor: colors.bgDisabled,
    borderBottomWidth: 0,
  },
  label_highlight: {
    color: colors.primaryText,
  },
  label_highlight_disabled: {
    color: colors.textDisabled,
  },

  // ── Secondary (White Raised) ───────────────────────
  secondary: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  secondary_disabled: {
    backgroundColor: colors.bgDisabled,
    borderWidth: 0,
  },
  label_secondary: {
    color: colors.textSecondary,
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

  // ── Danger (Red 3D Cancel) ────────────────────────
  danger: {
    backgroundColor: colors.error,
    borderBottomWidth: 3,
    borderBottomColor: colors.errorBorder,
  },
  danger_disabled: {
    backgroundColor: colors.bgDisabled,
    borderBottomWidth: 0,
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
