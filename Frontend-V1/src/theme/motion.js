/**
 * ServeLoco Motion Tokens
 *
 * All durations in milliseconds. All animations use the single
 * `easing` exported here for consistency.
 *
 * Easing: ease-out cubic (feels snappy and natural on mobile)
 * Encoded as React Native Easing.bezier values.
 */

import { Easing } from 'react-native';

// ── Durations ────────────────────────────────────────────────
export const tapMs = 150;          // tap / press feedback
export const smallMs = 200;        // chip, tab, toggle, stepper
export const screenMs = 320;       // screen content entrance
export const staggerMs = 38;       // delay between staggered cards
export const loopMs = 750;         // auth illustration float loop (half-cycle)
export const entryDistance = 12;   // px for fade+slide upward entry
export const modalScaleStart = 0.96; // modal scale from value

// ── Easing ───────────────────────────────────────────────────
// ease-out cubic — fast start, gentle finish; feels premium on mobile
export const easing = Easing.bezier(0.25, 0.1, 0.25, 1);

// For modals and dialogs: ease-out back (slight spring)
export const easingModal = Easing.bezier(0.34, 1.2, 0.64, 1);

// For reduced motion: instant / no easing
export const easingNone = Easing.linear;

// ── Shorthand config objects for Animated.timing ─────────────
export const motionConfig = {
  tap: { duration: tapMs, easing, useNativeDriver: true },
  small: { duration: smallMs, easing, useNativeDriver: true },
  screen: { duration: screenMs, easing, useNativeDriver: true },
  modal: { duration: smallMs, easing: easingModal, useNativeDriver: true },
  loop: { duration: loopMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true },
};
