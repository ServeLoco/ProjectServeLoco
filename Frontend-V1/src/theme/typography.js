/**
 * ServeLoco Typography Tokens
 *
 * Uses system font stack for React Native (SF Pro on iOS, Roboto on Android).
 * Falls back to 'System' for cross-platform consistency.
 * No emoji in any visible text per project rules.
 */

import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
  android: {
    regular: 'Roboto-Regular',
    medium: 'Roboto-Medium',
    semiBold: 'Roboto-Medium',
    bold: 'Roboto-Bold',
  },
  default: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
});

export const fontWeights = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  extraBold: '800',
};

export const fontSizes = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  display: 28,
  hero: 32,
};

export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
  loose: 1.8,
};

export const typography = {
  // Display / Hero
  hero: {
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.hero * lineHeights.tight,
    letterSpacing: -0.5,
  },
  display: {
    fontSize: fontSizes.display,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.display * lineHeights.tight,
    letterSpacing: -0.3,
  },

  // Headings
  h1: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.xxxl * lineHeights.tight,
    letterSpacing: -0.2,
  },
  h2: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.xxl * lineHeights.tight,
  },
  h3: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semiBold,
    lineHeight: fontSizes.xl * lineHeights.normal,
  },
  h4: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semiBold,
    lineHeight: fontSizes.lg * lineHeights.normal,
  },

  // Body
  bodyLarge: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.md * lineHeights.relaxed,
  },
  body: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.base * lineHeights.relaxed,
  },
  bodySmall: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.sm * lineHeights.relaxed,
  },

  // Labels & UI
  labelLarge: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semiBold,
    lineHeight: fontSizes.md * lineHeights.normal,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    lineHeight: fontSizes.base * lineHeights.normal,
  },
  labelSmall: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: fontSizes.sm * lineHeights.normal,
    letterSpacing: 0.2,
  },

  // Captions & Meta
  caption: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.xs * lineHeights.normal,
    letterSpacing: 0.2,
  },
  captionMedium: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: fontSizes.xs * lineHeights.normal,
    letterSpacing: 0.3,
  },

  // Button text
  buttonLarge: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semiBold,
    lineHeight: fontSizes.lg * lineHeights.normal,
    letterSpacing: 0.1,
  },
  button: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semiBold,
    lineHeight: fontSizes.base * lineHeights.normal,
    letterSpacing: 0.1,
  },
  buttonSmall: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semiBold,
    lineHeight: fontSizes.sm * lineHeights.normal,
    letterSpacing: 0.1,
  },

  // Price / Numbers
  price: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.lg * lineHeights.normal,
  },
  priceLarge: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.xxl * lineHeights.tight,
  },

  fontFamily,
};
