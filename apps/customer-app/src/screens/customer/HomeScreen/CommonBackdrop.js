import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

// The light, bright area the Common sections sit on, matched to the top
// bar's look (top to bottom), fading into the white page under the sections.
const AREA_COLORS = {
  day: ['#E2F3FD', '#F1F9FE', '#FFFFFF'], // light sky, under the sky blue bar
  night: ['#ECEBFF', '#F5F4FF', '#FFFFFF'], // soft moonlight lavender
  rain: ['#EBF0F6', '#F4F7FA', '#FFFFFF'], // light grey-blue
};
export const COMMON_FADE_PX = 34;

// Where the bar meets the light area: the bar's bottom curves gently down
// in the middle, with a soft shadow following the curve.
const CURVE_SIDE = 2; // height of the curve at the screen edges
const CURVE_DEPTH = 16; // how much lower it reaches in the middle
const CURVE_HEIGHT = CURVE_SIDE + CURVE_DEPTH + 8;

// The bar's curved bottom, `offset` px lower (for the shadow layers).
const curvePath = (width, offset) => {
  const side = CURVE_SIDE + offset;
  return `M0 0 L${width} 0 L${width} ${side} Q${width / 2} ${side + CURVE_DEPTH * 2} 0 ${side} Z`;
};

/**
 * Background of the Home "Common" area. It covers the scroll content from
 * the very top (behind the top bar) down to the end of the Common sections:
 * the bar colour behind the bar, a gentle curve where the bar ends, then a
 * light area that fades into the page. Purely decorative.
 *
 * look: 'day' | 'night' | 'rain' (the top bar's look).
 * barBottom: where the bar's solid part ends, from the top of this backdrop.
 */
export default function CommonBackdrop({ width, height, barColor, barShadow, barBottom, look = 'day' }) {
  const paths = useMemo(() => ({
    shadowFar: curvePath(width, 6),
    shadowNear: curvePath(width, 3),
    bar: curvePath(width, 0),
  }), [width]);

  const total = Math.max(height, 1);
  const solid = Math.max(0, barBottom);
  const fadeStart = total > COMMON_FADE_PX ? (total - COMMON_FADE_PX) / total : 0.8;
  const areaTop = Math.min(solid / total, fadeStart);

  return (
    <View pointerEvents="none" style={[styles.fill, { height: total }]}>
      <LinearGradient
        colors={AREA_COLORS[look] || AREA_COLORS.day}
        locations={[areaTop, fadeStart, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.bar, { height: solid, backgroundColor: barColor }]} />
      <Svg width={width} height={CURVE_HEIGHT} style={[styles.curve, { top: solid - 1 }]}>
        <Path d={paths.shadowFar} fill={barShadow} opacity={0.12} />
        <Path d={paths.shadowNear} fill={barShadow} opacity={0.22} />
        <Path d={paths.bar} fill={barColor} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  curve: { position: 'absolute', left: 0 },
});
