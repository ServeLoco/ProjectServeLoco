/**
 * ServeLoco Shadow Tokens
 *
 * Cross-platform shadows (iOS shadowProps + Android elevation).
 * Usage: spread with { ...shadows.card } on a View.
 */

import { Platform } from 'react-native';
import { colors } from './colors';

const makeShadow = (elevation, opacity, radius, offsetY) =>
  Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation },
    default: {},
  });

export const shadows = {
  none: {},

  // Subtle — for cards on white bg
  xs: makeShadow(1, 0.03, 3, 1),

  // Card default
  sm: makeShadow(3, 0.04, 6, 2),

  // Interactive card / pressed raised state
  md: makeShadow(5, 0.06, 10, 3),

  // Modal / bottom sheet
  lg: makeShadow(8, 0.08, 16, 4),

  // Floating sticky mini-cart / FAB
  xl: makeShadow(12, 0.10, 24, 6),

  // Card aliases
  card: makeShadow(3, 0.04, 8, 2),            // Softer, premium card shadow
  cardRaised: makeShadow(6, 0.07, 14, 4),      // Tactile raised card shadow
  modal: makeShadow(16, 0.12, 28, 8),
  navBar: makeShadow(4, 0.03, 10, -2),         // Premium bottom nav bar shadow
};
