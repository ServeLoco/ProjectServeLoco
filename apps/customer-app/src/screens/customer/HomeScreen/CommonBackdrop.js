import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '../../../utils';

// The light, bright area the Common sections sit on (top to bottom), fading
// into the white page in the space under the last section.
const AREA_COLORS = ['#FFEFD6', '#FFF5E6', '#FFFFFF'];
export const COMMON_FADE_PX = 34;

// Where the bar meets the light area: the bar ends in a wave, with a bright
// orange wave peeking out under it that drifts slowly sideways.
const WAVE_HEIGHT = 30;
const FRONT_BASE = 13;
const BACK_BASE = 20;
const AMPLITUDE = 6;
const BACK_COLOR = 'rgba(255, 140, 50, 0.55)';
const EDGE_COLOR = 'rgba(255, 196, 120, 0.9)';

// A filled wave: flat at the top, sine-shaped along the bottom.
function wavePath(width, base, period, phase) {
  const step = 4;
  let d = `M0 0 L${width} 0`;
  for (let x = width; x >= 0; x -= step) {
    const y = base + AMPLITUDE * Math.sin((2 * Math.PI * x) / period + phase);
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} Z`;
}

// Just the wavy bottom edge, for the thin bright line along the bar's wave.
function edgePath(width, base, period, phase) {
  let d = '';
  for (let x = 0; x <= width; x += 4) {
    const y = base + AMPLITUDE * Math.sin((2 * Math.PI * x) / period + phase);
    d += `${x === 0 ? 'M' : ' L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/**
 * Background of the Home "Common" area. It covers the scroll content from
 * the very top (behind the top bar) down to the end of the Common sections:
 * the bar colour behind the bar, a wave where the bar ends, then a light,
 * bright area that fades into the page. Purely decorative.
 *
 * barBottom: where the bar's solid part ends, from the top of this backdrop.
 */
export default function CommonBackdrop({ width, height, barColor, barBottom }) {
  const reducedMotion = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;
  const period = Math.max(120, width / 1.6);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const loop = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reducedMotion]);

  const paths = useMemo(() => ({
    // One period wider, so sliding it by one period loops without a jump.
    back: wavePath(width + period, BACK_BASE, period, Math.PI / 2),
    front: wavePath(width, FRONT_BASE, period, 0),
    edge: edgePath(width, FRONT_BASE, period, 0),
  }), [width, period]);

  const total = Math.max(height, 1);
  const solid = Math.max(0, barBottom);
  const fadeStart = total > COMMON_FADE_PX ? (total - COMMON_FADE_PX) / total : 0.8;
  const areaTop = Math.min(solid / total, fadeStart);

  return (
    <View pointerEvents="none" style={[styles.fill, { height: total }]}>
      <LinearGradient
        colors={AREA_COLORS}
        locations={[areaTop, fadeStart, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.bar, { height: solid, backgroundColor: barColor }]} />
      <View style={[styles.waves, { top: solid - 1, width }]}>
        <Animated.View
          style={{
            width: width + period,
            transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -period] }) }],
          }}
        >
          <Svg width={width + period} height={WAVE_HEIGHT}>
            <Path d={paths.back} fill={BACK_COLOR} />
          </Svg>
        </Animated.View>
        <Svg width={width} height={WAVE_HEIGHT} style={StyleSheet.absoluteFill}>
          <Path d={paths.front} fill={barColor} />
          <Path d={paths.edge} stroke={EDGE_COLOR} strokeWidth={1.5} fill="none" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  waves: { position: 'absolute', left: 0, height: WAVE_HEIGHT, overflow: 'hidden' },
});
