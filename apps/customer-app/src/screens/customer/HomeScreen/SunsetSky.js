import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SunCorner from './SunCorner';
import SkyBirds from './SkyBirds';

// Orange at the very top (behind the status bar) warming down to the bar's
// own red, so the bottom of the sky meets the bar colour with no edge.
const SUNSET_TOP = '#F6A66B';
// A setting sun: deep orange disc, warm glow, peach beams.
const SUNSET_SUN = { core: '#FF6B3D', glow: 'rgba(255, 107, 61, 0.32)', ray: '#FFB066' };

// Evening (5 PM – 7 PM IST) top bar: an orange-to-red sky, the sun setting
// at the top-right corner with soft beams, and black birds flying home.
// `minY` is how far above the bar the sky reaches (behind the status bar),
// `bottom` where the bar ends, `barColor` the bar's own colour.
// Purely decorative — never touchable.
export default function SunsetSky({ width, minY, bottom, barColor }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[SUNSET_TOP, barColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.sky, { top: minY, height: Math.max(0, bottom - minY) }]}
      />
      <SunCorner
        colors={SUNSET_SUN}
        style={{ top: minY + 22, right: -6 }}
        width={width + 6}
        height={Math.max(0, bottom - minY - 22)}
      />
      <SkyBirds top={4} width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  sky: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
