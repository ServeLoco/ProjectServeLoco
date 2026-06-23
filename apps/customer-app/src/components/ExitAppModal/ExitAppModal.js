import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing } from '../../theme';

/**
 * ExitAppModal
 * Modern, minimal confirmation sheet shown when the user backs out of
 * the Home screen. Designed to feel like a native iOS / Material You
 * dialog rather than a generic alert:
 *   - Centered card with soft shadow
 *   - Single-line question, friendly one-line subtitle
 *   - Subtitle adapts to cart state so we never lie to the user
 *   - Two pill buttons: "Stay" (subtle) and "Exit" (brand-filled)
 *   - Backdrop fades + card scales on enter
 *
 * Props:
 *   visible      - controls visibility
 *   cartItemCount- number of items currently in the cart (optional)
 *   onStay       - called when user dismisses
 *   onExit       - called when user confirms exit
 */
function ExitAppModal({ visible, cartItemCount = 0, onStay, onExit }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  // Don't tell the user their cart will be waiting if it's empty.
  const hasItems = Number(cartItemCount) > 0;
  const subtitle = hasItems
    ? 'Your cart will be here when you come back.'
    : 'You can come back anytime.';

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeValue: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeValue: true,
        }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible, opacity, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onStay}
    >
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onStay}
          accessibilityLabel="Dismiss"
        />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>Exit VillKro?</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.actions}>
            <Pressable
              onPress={onStay}
              style={({ pressed }) => [
                styles.btn,
                styles.btnStay,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Stay in app"
            >
              <Text style={styles.btnStayLabel}>Stay</Text>
            </Pressable>

            <Pressable
              onPress={onExit}
              style={({ pressed }) => [
                styles.btn,
                styles.btnExit,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Exit app"
            >
              <Text style={styles.btnExitLabel}>Exit</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bgSurface,
    borderRadius: 24,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnStay: {
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnStayLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  btnExit: {
    backgroundColor: colors.primary,
  },
  btnExitLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textInverse || '#FFFFFF',
  },
});

export default ExitAppModal;