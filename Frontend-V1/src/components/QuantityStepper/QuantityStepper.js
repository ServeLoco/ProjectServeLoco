import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutAnimation,
  UIManager,
  Platform,
  Animated,
} from 'react-native';
import { colors, typography, spacing, radius } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  dense = false,
}) {
  const normalizedQuantity = Math.max(0, Number(quantity) || 0);
  const prevQuantity = useRef(quantity);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const previousQuantity = Math.max(0, Number(prevQuantity.current) || 0);
    if ((previousQuantity === 0 && normalizedQuantity > 0) || (previousQuantity > 0 && normalizedQuantity === 0)) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } else if (previousQuantity > 0 && normalizedQuantity > 0 && previousQuantity !== normalizedQuantity) {
      // Scale bump on qty change
      scaleAnim.setValue(1.3);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }).start();
    }
    prevQuantity.current = normalizedQuantity;
  }, [normalizedQuantity, scaleAnim]);

  if (normalizedQuantity === 0) {
    return (
      <TouchableOpacity
        onPress={onAdd}
        disabled={disabled}
        activeOpacity={0.78}
        style={[
          styles.addBtn,
          compact && styles.addBtnCompact,
          dense && styles.addBtnDense,
          disabled && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add to cart"
      >
        <Text
          style={[styles.addLabel, compact && styles.addLabelCompact, dense && styles.addLabelDense]}
        >
          ADD
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.stepper, compact && styles.stepperCompact, dense && styles.stepperDense]}>
      <TouchableOpacity
        onPress={onDecrement}
        disabled={disabled}
        activeOpacity={0.7}
        style={[styles.stepBtn, compact && styles.stepBtnCompact, dense && styles.stepBtnDense]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Text style={styles.stepIcon}>-</Text>
      </TouchableOpacity>

      <Animated.Text style={[styles.qty, compact && styles.qtyCompact, dense && styles.qtyDense, { transform: [{ scale: scaleAnim }] }]}>
        {normalizedQuantity}
      </Animated.Text>

      <TouchableOpacity
        onPress={onIncrement}
        disabled={disabled}
        activeOpacity={0.7}
        style={[styles.stepBtn, compact && styles.stepBtnCompact, dense && styles.stepBtnDense]}
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
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  addBtnCompact: {
    height: 26,
    paddingHorizontal: spacing.xs,
    minWidth: 44,
    width: '100%',
    borderRadius: radius.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000000',
  },
  addBtnDense: {
    height: 22,
    minWidth: 38,
    paddingHorizontal: spacing.xs,
  },
  addLabel: {
    ...typography.button,
    color: colors.primaryText,
  },
  addLabelCompact: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: colors.primaryText,
  },
  addLabelDense: {
    fontSize: 9.5,
    lineHeight: 11,
    fontWeight: '800',
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
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  stepperCompact: {
    height: 26,
    minWidth: 72,
    width: '100%',
    borderRadius: radius.sm,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000000',
  },
  stepperDense: {
    height: 22,
    minWidth: 62,
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnCompact: {
    width: 24,
    height: 26,
  },
  stepBtnDense: {
    width: 20,
    height: 22,
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
  qtyDense: {
    fontSize: 11,
    lineHeight: 13,
  },

  disabled: {
    opacity: 0.45,
  },
});

export default QuantityStepper;
