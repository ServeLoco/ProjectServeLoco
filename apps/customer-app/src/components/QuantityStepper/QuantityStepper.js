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
import { colors, typography, spacing, radius, shadows } from '../../theme';
import AppIcon from '../AppIcon';

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
 *   dense        - even smaller variant for compact grids
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
      <View
        onStartShouldSetResponder={() => true}
        onTouchEnd={(e) => { e.stopPropagation && e.stopPropagation(); }}
        style={styles.wrapper}
      >
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
          <View style={styles.addBtnInner}>
            <AppIcon name="plus" size={compact ? 14 : 16} color={colors.textInverse} strokeWidth={2.6} />
            <Text
              style={[styles.addLabel, compact && styles.addLabelCompact, dense && styles.addLabelDense]}
            >
              ADD
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.stepper, compact && styles.stepperCompact, dense && styles.stepperDense]}
      onStartShouldSetResponder={() => true}
      onTouchEnd={(e) => { e.stopPropagation && e.stopPropagation(); }}
    >
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
  wrapper: {
    flexShrink: 0,
  },

  // ── Add button ───────────────────────────────────
  addBtn: {
    backgroundColor: colors.saffron,
    borderRadius: radius.md,
    height: 40,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
    ...shadows.sm,
  },
  addBtnCompact: {
    height: 34,
    paddingHorizontal: spacing.sm,
    minWidth: 60,
    width: '100%',
    borderRadius: radius.sm,
  },
  addBtnDense: {
    height: 32,
    minWidth: 52,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  addBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addLabel: {
    ...typography.button,
    color: colors.textInverse,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  addLabelCompact: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textInverse,
  },
  addLabelDense: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.textInverse,
  },

  // ── Stepper ──────────────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.saffron,
    borderRadius: radius.md,
    height: 40,
    overflow: 'hidden',
    minWidth: 110,
    ...shadows.sm,
  },
  stepperCompact: {
    height: 34,
    minWidth: 80,
    width: '100%',
    borderRadius: radius.sm,
  },
  stepperDense: {
    height: 32,
    minWidth: 68,
    borderRadius: radius.sm,
  },
  stepBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnCompact: {
    width: 26,
    height: 34,
  },
  stepBtnDense: {
    width: 22,
    height: 32,
  },
  stepIcon: {
    fontSize: 18,
    lineHeight: 20,
    color: colors.textInverse,
    fontWeight: '800',
    includeFontPadding: false,
  },
  qty: {
    flex: 1,
    minWidth: 18,
    textAlign: 'center',
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 16,
  },
  qtyCompact: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 15,
    minWidth: 18,
  },
  qtyDense: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textInverse,
    fontWeight: '800',
    minWidth: 16,
  },

  disabled: {
    opacity: 0.45,
  },
});

export default React.memo(QuantityStepper);
