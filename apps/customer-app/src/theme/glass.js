/**
 * Shop-owner "black + saffron glass" tokens.
 *
 * The shop surfaces (dashboard, orders, products) sit on a soft dark canvas
 * and every box on top of it is a translucent pane with a light rim. Keep the
 * values here rather than per screen so the three tabs stay identical.
 */
import { Platform } from 'react-native';
import { shadows } from './shadows';

export const glass = {
  /* Page background — the shop tabs sit on this, a shade off pure black. */
  screen: '#222227',
  /* Raised surface: modals, bottom sheets, popups. Sits a shade above the
   * page so a sheet reads as lifted off the black rather than merged into it. */
  canvas: '#1B1B1F',

  /* Panes */
  fill: 'rgba(255,255,255,0.07)',
  fillStrong: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.16)',
  divider: 'rgba(255,255,255,0.12)',

  /* Saffron accents */
  tint: 'rgba(255,122,58,0.16)',
  tintStrong: 'rgba(255,122,58,0.22)',
  borderWarm: 'rgba(255,138,74,0.38)',

  /* Ink */
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.40)',

  /* Status tints that survive a black background */
  successFill: 'rgba(31,181,116,0.18)',
  successRim: 'rgba(31,181,116,0.38)',
  successText: '#2FD892',
  errorFill: 'rgba(229,72,77,0.16)',
  errorRim: 'rgba(229,72,77,0.55)',
  errorText: '#FF8A8D',
  infoFill: 'rgba(59,130,246,0.18)',
  infoRim: 'rgba(59,130,246,0.38)',
  infoText: '#8FB8FF',
  warningFill: 'rgba(244,166,42,0.16)',
  warningRim: 'rgba(244,166,42,0.35)',
  warningText: '#FFD79A',
};

/** Corner radii for the glass surfaces. */
export const glassRadius = { hero: 30, card: 26, inner: 18 };

/**
 * Android draws elevation shadows *under* the view, so on a translucent pane
 * the shadow shows straight through and greys the glass out. Depth on glass
 * therefore comes from the rim highlight alone on Android.
 */
export const glassShadow = Platform.select({ ios: shadows.sm, android: {} });
