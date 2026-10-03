import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Path } from 'react-native-svg';
import HomeIcon from './HomeIcon';
import { useReducedMotion } from '../../../utils';

// The light, bright area the Common sections sit on, matched to the top
// bar's look (top to bottom), fading into the white page under the sections.
const AREA_COLORS = {
  day: ['#E2F3FD', '#F1F9FE', '#FFFFFF'], // light sky, under the sky blue bar
  night: ['#ECEBFF', '#F5F4FF', '#FFFFFF'], // soft moonlight lavender
  rain: ['#EBF0F6', '#F4F7FA', '#FFFFFF'], // light grey-blue
};
// The dashed cut line and the scissors on it.
const CUT_COLORS = {
  day: { line: '#7DB2D6', scissors: '#2F78AE' },
  night: { line: '#A29ED9', scissors: '#5B52C2' },
  rain: { line: '#9DAABA', scissors: '#5E7185' },
};
export const COMMON_FADE_PX = 34;

// Where the bar meets the light area it looks like a torn coupon: zigzag
// teeth, then a dashed cut line with scissors that now and then snip along it.
const TOOTH_WIDTH = 14;
const TOOTH_HEIGHT = 8;
const LINE_GAP = 10; // from the tip of the teeth to the cut line
const SCISSORS_SIZE = 18;
const EDGE_INSET = 10;

// Zigzag teeth hanging from the bar, `offset` px lower (for the shadow).
const teethPath = (width, offset) => {
  let d = `M0 0 L${width} 0 L${width} ${offset}`;
  for (let x = width; x > 0; x -= TOOTH_WIDTH) {
    const left = Math.max(0, x - TOOTH_WIDTH);
    d += ` L${(x + left) / 2} ${TOOTH_HEIGHT + offset} L${left} ${offset}`;
  }
  return `${d} Z`;
};

/**
 * Background of the Home "Common" area. It covers the scroll content from
 * the very top (behind the top bar) down to the end of the Common sections:
 * the bar colour behind the bar, a torn-coupon edge where the bar ends, then
 * a light area that fades into the page. Purely decorative.
 *
 * look: 'day' | 'night' | 'rain' (the top bar's look).
 * barBottom: where the bar's solid part ends, from the top of this backdrop.
 */
export default function CommonBackdrop({ width, height, barColor, barShadow, barBottom, look = 'day' }) {
  const reducedMotion = useReducedMotion();
  const travel = useRef(new Animated.Value(0)).current;
  const snip = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(1)).current;
  const cut = CUT_COLORS[look] || CUT_COLORS.day;

  // Every few seconds the scissors cut along the line to the other side,
  // snipping as they go, then come back to the start.
  useEffect(() => {
    if (reducedMotion || !width) return undefined;
    const snipping = Animated.loop(
      Animated.sequence([
        Animated.timing(snip, { toValue: 1, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(snip, { toValue: 0, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      { iterations: 10 }
    );
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(3200),
        Animated.parallel([
          Animated.timing(travel, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          snipping,
        ]),
        Animated.timing(shown, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(shown, { toValue: 1, duration: 320, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      snip.setValue(0);
      shown.setValue(1);
      travel.setValue(0);
    };
  }, [travel, snip, shown, width, reducedMotion]);

  const paths = useMemo(() => ({
    shadow: teethPath(width, 2),
    teeth: teethPath(width, 0),
  }), [width]);

  const total = Math.max(height, 1);
  const solid = Math.max(0, barBottom);
  const fadeStart = total > COMMON_FADE_PX ? (total - COMMON_FADE_PX) / total : 0.8;
  const areaTop = Math.min(solid / total, fadeStart);
  const lineY = solid + TOOTH_HEIGHT + LINE_GAP;

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
      <Svg width={width} height={TOOTH_HEIGHT + 4} style={[styles.abs, { top: solid - 1 }]}>
        <Path d={paths.shadow} fill={barShadow} opacity={0.2} />
        <Path d={paths.teeth} fill={barColor} />
      </Svg>
      <Svg width={width} height={4} style={[styles.abs, { top: lineY - 2 }]}>
        <Line
          x1={EDGE_INSET}
          y1={2}
          x2={width - EDGE_INSET}
          y2={2}
          stroke={cut.line}
          strokeWidth={1.6}
          strokeDasharray="7 5"
          strokeLinecap="round"
        />
      </Svg>
      <Animated.View
        style={[
          styles.abs,
          {
            top: lineY - SCISSORS_SIZE / 2,
            left: EDGE_INSET - 4,
            opacity: shown,
            transform: [
              { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, width - EDGE_INSET * 2 - SCISSORS_SIZE + 8)] }) },
              { rotate: snip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-16deg'] }) },
            ],
          },
        ]}
      >
        <HomeIcon name="scissors" size={SCISSORS_SIZE} color={cut.scissors} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  abs: { position: 'absolute', left: 0 },
});
