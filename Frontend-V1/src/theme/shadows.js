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
  xs: makeShadow(1, 0.04, 2, 1),

  // Card default
  sm: makeShadow(2, 0.06, 4, 2),

  // Interactive card / pressed raised state
  md: makeShadow(4, 0.08, 8, 3),

  // Modal / bottom sheet
  lg: makeShadow(8, 0.12, 16, 4),

  // Floating sticky mini-cart / FAB
  xl: makeShadow(12, 0.16, 24, 6),

  // Card aliases
  card: makeShadow(2, 0.06, 6, 2),
  cardRaised: makeShadow(6, 0.10, 12, 3),
  modal: makeShadow(16, 0.18, 32, 8),
  navBar: makeShadow(4, 0.06, 8, -2),
};
