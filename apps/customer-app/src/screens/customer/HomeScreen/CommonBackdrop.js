import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useReducedMotion } from '../../../utils';

// The light, bright area the Common sections sit on, matched to the top
// bar's look (top to bottom), fading into the white page under the sections.
const AREA_COLORS = {
  day: ['#E2F3FD', '#F1F9FE', '#FFFFFF'], // light sky, under the sky blue bar
  night: ['#ECEBFF', '#F5F4FF', '#FFFFFF'], // soft moonlight lavender
  rain: ['#EBF0F6', '#F4F7FA', '#FFFFFF'], // light grey-blue
};
// The clouds drifting in front of the bar's edge.
const CLOUD_COLORS = {
  day: '#FFFFFF',
  night: '#686D78',
  rain: '#F3F5F8',
};
const STAR_COLORS = ['#8E83E8', '#F2B84B'];
// The see-through bubbles rising in the light area, in a tint of each look.
const BUBBLE_TINTS = {
  day: '96, 170, 220',
  night: '142, 131, 232',
  rain: '120, 140, 165',
};
export const COMMON_FADE_PX = 34;

// Where the bar meets the light area it ends in a bank of puffy clouds, with
// lighter clouds drifting slowly in front; at night a few stars twinkle below.
const BANK_OVERLAP = 20; // how far the bank's drawing reaches up into the bar
const BANK_HEIGHT = BANK_OVERLAP + 16;
const BANK_STEP = 22;
const CLOUD_ROW_TOP = -3; // drifting clouds, from the bar's bottom (overlapping the bumps)
const CLOUD_ROW_HEIGHT = 22;
const DRIFT_MS = 48000;
// Drifting clouds across one screen width: left (fraction), width, height.
const CLOUDS = [
  { at: 0.02, w: 54, h: 18 },
  { at: 0.27, w: 40, h: 14 },
  { at: 0.5, w: 62, h: 20 },
  { at: 0.78, w: 46, h: 16 },
];
// Night stars below the clouds: x (fraction), y (from the bar's bottom), size.
const STARS = [
  { x: 0.1, y: 28, size: 9 },
  { x: 0.31, y: 34, size: 7 },
  { x: 0.55, y: 27, size: 10 },
  { x: 0.74, y: 35, size: 7 },
  { x: 0.92, y: 29, size: 8 },
];

// Bubbles: x (fraction of the width), size, time to rise, first start.
const BUBBLES = [
  { x: 0.03, size: 14, rise: 9000, delay: 0 },
  { x: 0.12, size: 12, rise: 10000, delay: 7600 },
  { x: 0.18, size: 9, rise: 7500, delay: 2200 },
  { x: 0.34, size: 18, rise: 10500, delay: 4800 },
  { x: 0.47, size: 11, rise: 8200, delay: 1200 },
  { x: 0.62, size: 16, rise: 9800, delay: 3600 },
  { x: 0.78, size: 10, rise: 7000, delay: 600 },
  { x: 0.8, size: 20, rise: 11000, delay: 5600 },
  { x: 0.92, size: 12, rise: 8600, delay: 2900 },
  { x: 0.97, size: 15, rise: 9400, delay: 6800 },
];

// One bubble: rises from `from` to `to` (px from the backdrop's top),
// swaying a little, fading in at the bottom and out near the clouds.
function Bubble({ left, size, from, to, rise, delay, tint }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(progress, { toValue: 1, duration: rise, easing: Easing.linear, useNativeDriver: true })),
    ]);
    run.start();
    return () => run.stop();
  }, [progress, rise, delay]);
  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: `rgba(${tint}, 0.55)`,
          backgroundColor: `rgba(${tint}, 0.16)`,
          opacity: progress.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 0.9, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
            { translateX: progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 5, 0, -5, 0] }) },
          ],
        },
      ]}
    >
      <View style={[styles.bubbleShine, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 }]} />
    </Animated.View>
  );
}

// A puffy cloud with a flat bottom, as SVG shapes at (x, y), w × h.
function CloudShape({ x, y, w, h, fill }) {
  return (
    <>
      <Circle cx={x + w * 0.28} cy={y + h * 0.62} r={h * 0.36} fill={fill} />
      <Circle cx={x + w * 0.52} cy={y + h * 0.45} r={h * 0.45} fill={fill} />
      <Circle cx={x + w * 0.74} cy={y + h * 0.62} r={h * 0.34} fill={fill} />
      <Rect x={x + w * 0.2} y={y + h * 0.6} width={w * 0.62} height={h * 0.4} rx={h * 0.2} fill={fill} />
    </>
  );
}

// A four-point sparkle star.
const starPath = (s) => `M${s / 2} 0 Q${s * 0.58} ${s * 0.42} ${s} ${s / 2} Q${s * 0.58} ${s * 0.58} ${s / 2} ${s} Q${s * 0.42} ${s * 0.58} 0 ${s / 2} Q${s * 0.42} ${s * 0.42} ${s / 2} 0 Z`;

function TwinkleStar({ left, top, size, color, delay, still }) {
  const glow = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow, delay, still]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
        transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }],
      }}
    >
      <Svg width={size} height={size}>
        <Path d={starPath(size)} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Background of the Home "Common" area. It covers the scroll content from
 * the very top (behind the top bar) down to the end of the Common sections:
 * the bar colour behind the bar, a cloud edge where the bar ends, then a
 * light area with bubbles slowly rising in it, fading into the page.
 * Purely decorative.
 *
 * look: 'day' | 'night' | 'rain' (the top bar's look).
 * barBottom: where the bar's solid part ends, from the top of this backdrop.
 */
export default function CommonBackdrop({ width, height, barColor, barShadow, barBottom, look = 'day' }) {
  const reducedMotion = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;

  // The front clouds drift slowly left, forever (two copies side by side,
  // moved by one screen width, so the loop has no jump).
  useEffect(() => {
    if (reducedMotion || !width) return undefined;
    const loop = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [drift, width, reducedMotion]);

  // Bumps along the bar's bottom edge: radii cycle so the bank looks natural.
  const bumps = useMemo(() => {
    const list = [];
    for (let i = 0, x = -8; x < width + BANK_STEP; i += 1, x += BANK_STEP) {
      const r = [12, 15, 11, 14, 13][i % 5];
      list.push({ cx: x, cy: BANK_OVERLAP - r * 0.25, r });
    }
    return list;
  }, [width]);

  const total = Math.max(height, 1);
  const solid = Math.max(0, barBottom);
  const fadeStart = total > COMMON_FADE_PX ? (total - COMMON_FADE_PX) / total : 0.8;
  const areaTop = Math.min(solid / total, fadeStart);
  const cloudFill = CLOUD_COLORS[look] || CLOUD_COLORS.day;

  return (
    <View pointerEvents="none" style={[styles.fill, { height: total }]}>
      <LinearGradient
        colors={AREA_COLORS[look] || AREA_COLORS.day}
        locations={[areaTop, fadeStart, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Bubbles rise behind the clouds and the cards. */}
      {reducedMotion || total - solid < 60
        ? null
        : BUBBLES.map((b, i) => (
          <Bubble
            key={i}
            left={b.x * width - b.size / 2}
            size={b.size}
            from={total - b.size - 4}
            to={solid + 6}
            rise={b.rise}
            delay={b.delay}
            tint={BUBBLE_TINTS[look] || BUBBLE_TINTS.day}
          />
        ))}
      <View style={[styles.bar, { height: solid, backgroundColor: barColor }]} />

      {/* The bank of puffy bumps hanging from the bar, with a soft shadow. */}
      <Svg width={width} height={BANK_HEIGHT} style={[styles.abs, { top: solid - BANK_OVERLAP }]}>
        {bumps.map((b, i) => (
          <Circle key={`s${i}`} cx={b.cx} cy={b.cy + 2} r={b.r} fill={barShadow} opacity={0.14} />
        ))}
        <Rect x={0} y={0} width={width} height={BANK_OVERLAP} fill={barColor} />
        {bumps.map((b, i) => (
          <Circle key={`b${i}`} cx={b.cx} cy={b.cy} r={b.r} fill={barColor} />
        ))}
      </Svg>

      {/* Lighter clouds drifting in front of the bank. */}
      <View style={[styles.abs, styles.clip, { top: solid + CLOUD_ROW_TOP - 10, width, height: CLOUD_ROW_HEIGHT + 10 }]}>
        <Animated.View
          style={{
            width: width * 2,
            transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }],
          }}
        >
          <Svg width={width * 2} height={CLOUD_ROW_HEIGHT + 10}>
            {[0, 1].map((copy) => CLOUDS.map((c, i) => (
              <CloudShape
                key={`${copy}-${i}`}
                x={copy * width + c.at * width}
                y={10 + CLOUD_ROW_HEIGHT - c.h}
                w={c.w}
                h={c.h}
                fill={cloudFill}
              />
            )))}
          </Svg>
        </Animated.View>
      </View>

      {look === 'night'
        ? STARS.map((star, i) => (
          <TwinkleStar
            key={i}
            left={star.x * width - star.size / 2}
            top={solid + star.y}
            size={star.size}
            color={STAR_COLORS[i % STAR_COLORS.length]}
            delay={i * 420}
            still={reducedMotion}
          />
        ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  abs: { position: 'absolute', left: 0 },
  clip: { overflow: 'hidden' },
  bubble: { position: 'absolute', top: 0, borderWidth: 1.2 },
  bubbleShine: { position: 'absolute', top: '18%', left: '20%', backgroundColor: 'rgba(255, 255, 255, 0.85)' },
});
