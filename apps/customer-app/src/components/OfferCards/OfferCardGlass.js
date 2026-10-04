import React from 'react';
import { StyleSheet, View, processColor } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import NativeGlassView from '../../utils/nativeGlass';

export function glassTint(color, opacity) {
  const value = processColor(color);
  if (typeof value !== 'number') return color;
  return `rgba(${(value >>> 16) & 255},${(value >>> 8) & 255},${value & 255},${opacity})`;
}

/** One glass surface per card; product text and controls stay sharp above it. */
export default function OfferCardGlass({ children, style, look }) {
  const Surface = NativeGlassView || View;
  const nativeProps = NativeGlassView ? {
    glassEffectStyle: 'regular',
    colorScheme: 'light',
    tintColor: glassTint(look.accentColor, 0.12),
    isInteractive: false,
  } : {};

  return (
    <Surface {...nativeProps} style={[style, styles.surface]}>
      {!NativeGlassView ? (
        <LinearGradient
          pointerEvents="none"
          colors={[glassTint(look.bgColor, 0.78), glassTint(look.bgColorEnd, 0.42)]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.58)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']}
        locations={[0, 0.38, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
      <View pointerEvents="none" style={styles.rim} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.65)',
    borderBottomColor: 'rgba(255,255,255,0.3)',
    borderRightColor: 'rgba(255,255,255,0.3)',
  },
});
