import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView as ExpoBlurView } from 'expo-blur';

/**
 * Drop-in for expo-blur's BlurView (same props).
 *
 * iOS: the real expo-blur view.
 *
 * Android: a plain View painting the colour expo-blur itself paints there.
 * We never pass experimentalBlurMethod (it crashed the app — see the comments
 * at the call sites), and without it expo-blur on Android does not blur at
 * all: it only sets a translucent background colour. But it still wires up
 * its native blur machinery every time one attaches to the screen, and part
 * of that asks for the current Activity — which throws, and kills the app,
 * when it attaches while the Activity is gone ("The current activity is no
 * longer available", ExpoBlurView.configureBlurView, Crashlytics 1.9.5).
 * Same pixels, none of that code.
 */

// expo-blur 15 (android/.../enums/TintStyle.kt): which colour each tint uses
// with no blur method, as [alpha factor, grey level].
const TINT_COLOURS = {
  dark: [0.69, 25],
  light: [0.78, 249],
  regular: [0.82, 179],
  systemThinMaterialLight: [0.78, 199],
  systemThinMaterial: [0.97, 199],
  systemChromeMaterial: [0.75, 255],
  systemChromeMaterialLight: [0.97, 255],
  systemUltraThinMaterial: [0.44, 191],
  systemThickMaterial: [0.97, 153],
  systemThickMaterialDark: [0.9, 37],
  systemThinMaterialDark: [0.7, 37],
  systemUltraThinMaterialDark: [0.55, 37],
  systemChromeMaterialDark: [0.75, 0],
};
const FALLBACK_COLOUR = [0.44, 255];

// TintStyle.toBlurEffect folds these onto another tint's colour.
const TINT_ALIASES = {
  extraLight: 'light',
  systemMaterialLight: 'light',
  systemUltraThinMaterialLight: 'light',
  systemThickMaterialLight: 'light',
  systemMaterialDark: 'dark',
};

const hex = (n) => n.toString(16).padStart(2, '0');

/**
 * The background colour expo-blur's Android view ends up with, as #RRGGBBAA.
 * Mirrors its arithmetic exactly, Float steps included (intensity / 100 and
 * 255 * that are Kotlin Floats; the alpha is truncated, not rounded).
 */
export function androidTintColor(tint = 'default', intensity = 50) {
  const [factor, grey] = TINT_COLOURS[TINT_ALIASES[tint] || tint] || FALLBACK_COLOUR;
  const fraction = Math.fround(Math.fround(intensity) / 100);
  const alpha = Math.trunc(Math.fround(255 * fraction) * factor);
  return `#${hex(grey)}${hex(grey)}${hex(grey)}${hex(alpha & 0xff)}`;
}

export default function BlurView(props) {
  if (Platform.OS !== 'android') return <ExpoBlurView {...props} />;

  const {
    tint = 'default',
    intensity = 50,
    // Blur-only props: nothing to blur on Android.
    blurReductionFactor, // eslint-disable-line no-unused-vars
    experimentalBlurMethod, // eslint-disable-line no-unused-vars
    style,
    children,
    ...rest
  } = props;

  // Same structure as expo-blur's wrapper: the tint fills the box behind the
  // children.
  return (
    <View {...rest} style={[styles.container, style]}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: androidTintColor(tint, intensity) }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: 'transparent' },
});
