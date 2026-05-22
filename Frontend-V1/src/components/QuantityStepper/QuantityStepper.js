import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, typography, spacing, radius } from '../../theme';

/**
 * QuantityStepper
 * Toggles between "Add" button and "- qty +" stepper.
 *
 * Props:
 *   quantity     - current quantity (0 means show Add button)
 *   onAdd        - called when Add is tapped (from 0)
 *   onIncrement  - called to increase qty
 *   onDecrement  - called to decrease qty (removes item when reaches 0)
 *   disabled     - disables all interactions (unavailable product)
 *   compact      - smaller variant for list cards
 */
function QuantityStepper({
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  disabled = false,
  compact = false,
}) {
  if (quantity === 0) {
    return (
      <TouchableOpacity
        onPress={onAdd}
        disabled={disabled}
        activeOpacity={0.78}
        style={[
          styles.addBtn,
          compact && styles.addBtnCompact,
          disabled && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add to cart"
      >
        <Text
          style={[styles.addLabel, compact && styles.addLabelCompact]}
        >
          Add
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <TouchableOpacity
        onPress={onDecrement}
        disabled={disabled}
        activeOpacity={0.7}
        style={[styles.stepBtn, compact && styles.stepBtnCompact]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Text style={styles.stepIcon}>-</Text>
      </TouchableOpacity>

      <Text style={[styles.qty, compact && styles.qtyCompact]}>
        {quantity}
      </Text>

      <TouchableOpacity
        onPress={onIncrement}
        disabled={disabled}
        activeOpacity={0.7}
        style={[styles.stepBtn, compact && styles.stepBtnCompact]}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Text style={styles.stepIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Add button ───────────────────────────────────
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 36,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  addBtnCompact: {
    height: 30,
    paddingHorizontal: spacing.sm,
    minWidth: 56,
    borderRadius: radius.sm,
  },
  addLabel: {
    ...typography.button,
    color: colors.primaryText,
  },
  addLabelCompact: {
    ...typography.buttonSmall,
    color: colors.primaryText,
  },

  // ── Stepper ──────────────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 36,
    overflow: 'hidden',
    minWidth: 104,
  },
  stepperCompact: {
    height: 30,
    minWidth: 84,
    borderRadius: radius.sm,
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnCompact: {
    width: 28,
    height: 30,
  },
  stepIcon: {
    ...typography.h3,
    color: colors.primaryText,
    lineHeight: 20,
    fontWeight: '700',
    includeFontPadding: false,
  },
  qty: {
    flex: 1,
    textAlign: 'center',
    ...typography.labelLarge,
    color: colors.primaryText,
    fontWeight: '700',
  },
  qtyCompact: {
    ...typography.label,
    color: colors.primaryText,
    fontWeight: '700',
  },

  disabled: {
    opacity: 0.45,
  },
});

export default QuantityStepper;
