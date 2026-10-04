import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import NativeGlassView from '../../utils/nativeGlass';

export default function TabBarGlass({ children, style }) {
  if (NativeGlassView) {
    return (
      <NativeGlassView
        glassEffectStyle="regular"
        colorScheme="light"
        isInteractive
        style={style}
      >
        {children}
      </NativeGlassView>
    );
  }

  // Android and older iOS use a translucent surface. No experimental Android
  // backdrop blur: the app previously crashed when it captured scrolling lists.
  return (
    <View style={[style, styles.fallback]}>
      <View pointerEvents="none" style={styles.material} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.01)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.88)',
    overflow: 'hidden',
  },
  material: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248,250,252,0.38)',
  },
});
