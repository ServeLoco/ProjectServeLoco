/**
 * ServeLoco Color Tokens
 *
 * Background  : off-white / white
 * Text        : deep charcoal
 * Primary     : warm amber-orange (original — not Blinkit/Swiggy yellow)
 * Success     : cool teal-green
 */

const palette = {
  // Neutrals
  white: '#FFFFFF',
  offWhite: '#F7F6F2',
  grey50: '#F4F4F5',
  grey100: '#E8E8EA',
  grey200: '#D4D4D8',
  grey300: '#A1A1AA',
  grey400: '#71717A',
  grey500: '#52525B',
  grey600: '#3F3F46',
  charcoal: '#1C1C1E',
  black: '#0A0A0A',

  // Primary — warm amber-orange
  primary50: '#FFF8EE',
  primary100: '#FFECD0',
  primary200: '#FFD49A',
  primary300: '#FFB85A',
  primary400: '#FF9A20',
  primary500: '#F07C00',  // main primary
  primary600: '#C76200',
  primary700: '#9E4D00',

  // Success — cool teal-green
  success50: '#EDFAF4',
  success100: '#C6F0DC',
  success200: '#7DDEB2',
  success300: '#34C57E',
  success500: '#1AA362',  // main success
  success600: '#148050',
  success700: '#0E5E3A',

  // Error
  error50: '#FFF2F2',
  error300: '#F87171',
  error500: '#DC2626',
  error600: '#B91C1C',

  // Warning
  warning300: '#FCD34D',
  warning500: '#D97706',

  // Info
  info300: '#60A5FA',
  info500: '#2563EB',

  // Overlay
  overlayLight: 'rgba(0,0,0,0.04)',
  overlayMid: 'rgba(0,0,0,0.40)',
  overlayDark: 'rgba(0,0,0,0.65)',
  overlayWhite: 'rgba(255,255,255,0.90)',
};

export const colors = {
  // --- Backgrounds ---
  bgApp: palette.offWhite,
  bgSurface: palette.white,
  bgCard: palette.white,
  bgInput: palette.grey50,
  bgDisabled: palette.grey100,
  bgSkeletonBase: palette.grey100,
  bgSkeletonShimmer: palette.grey200,

  // --- Text ---
  textPrimary: palette.charcoal,
  textSecondary: palette.grey500,
  textHint: palette.grey300,
  textDisabled: palette.grey300,
  textInverse: palette.white,
  textLink: palette.primary500,
  textError: palette.error500,
  textSuccess: palette.success500,

  // --- Primary Accent (warm amber-orange) ---
  primary: palette.primary500,
  primaryLight: palette.primary100,
  primaryDark: palette.primary600,
  primaryText: palette.white,

  // --- Success Accent (cool teal-green) ---
  success: palette.success500,
  successLight: palette.success50,
  successDark: palette.success600,
  successText: palette.white,

  // --- Error ---
  error: palette.error500,
  errorLight: palette.error50,
  errorBorder: palette.error300,

  // --- Warning ---
  warning: palette.warning500,
  warningLight: '#FFFBEB',

  // --- Info ---
  info: palette.info500,
  infoLight: '#EFF6FF',

  // --- Borders ---
  border: palette.grey100,
  borderStrong: palette.grey200,
  borderFocus: palette.primary400,

  // --- Navigation ---
  navBg: palette.white,
  navActive: palette.primary500,
  navInactive: palette.grey300,

  // --- Overlays ---
  overlay: palette.overlayMid,
  overlayDark: palette.overlayDark,
  overlayLight: palette.overlayLight,

  // --- Misc ---
  shimmerFrom: palette.grey100,
  shimmerTo: palette.grey200,
  badgeBg: palette.primary500,
  badgeText: palette.white,
  divider: palette.grey100,
  shadow: palette.black,

  // Raw palette for edge cases
  palette,
};
