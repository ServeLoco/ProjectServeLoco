import { runHomeAmbientAnimation } from '../../../utils/homeScrollMotion';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useReducedMotion } from '../../../utils';

// The light, bright area the Common sections sit on, matched to the top
// bar's look (top to bottom), fading into the white page under the sections.
const AREA_COLORS = {
  day: ['#C0E3F8', '#DBEFFB', '#FFFFFF'], // sky, under the sky blue bar
  night: ['#D2CDF8', '#E5E2FC', '#FFFFFF'], // moonlight lavender
  rain: ['#D1DAE6', '#E4EAF1', '#FFFFFF'], // grey-blue
};
// How much of an offer card's colour goes into the area (the rest is white):
// at the top, in the middle, and none at the bottom.
const TINT_TOP = 0.22;
const TINT_MIDDLE = 0.11;

// "#2E9E45" or "#2E9" → [46, 158, 69]; null if it is not a hex colour.
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const mixWithWhite = (rgb, amount) => `rgb(${rgb.map((c) => Math.round(c * amount + 255 * (1 - amount))).join(', ')})`;
// The area colours for one offer card colour, or null to keep the bar look's.
function tintColors(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? [mixWithWhite(rgb, TINT_TOP), mixWithWhite(rgb, TINT_MIDDLE), '#FFFFFF'] : null;
}
export const COMMON_FADE_PX = 34;

// Where the bar meets the light area it ends in a bank of puffy clouds.
const BANK_OVERLAP = 20; // how far the bank's drawing reaches up into the bar
const BANK_HEIGHT = BANK_OVERLAP + 16;
const BANK_STEP = 22;

// Confetti falling gently through the area: x (fraction of the width),
// shape, size, time to fall, first start, turns while falling, colour.
const CONFETTI_COLORS = ['#FF6B9A', '#F2B84B', '#3CC88A', '#5AA9F0', '#8E83E8', '#FF8A4C'];
const CONFETTI = [
  { x: 0.04, shape: 'strip', size: 9, fall: 8200, delay: 0, turns: 1.5, color: 0 },
  { x: 0.11, shape: 'dot', size: 6, fall: 9600, delay: 5200, turns: 0, color: 3 },
  { x: 0.19, shape: 'square', size: 7, fall: 7400, delay: 2400, turns: -1.2, color: 1 },
  { x: 0.27, shape: 'strip', size: 10, fall: 10200, delay: 7000, turns: 1, color: 4 },
  { x: 0.35, shape: 'dot', size: 5, fall: 8800, delay: 1200, turns: 0, color: 2 },
  { x: 0.43, shape: 'strip', size: 8, fall: 7800, delay: 4300, turns: -1.6, color: 5 },
  { x: 0.5, shape: 'square', size: 6, fall: 9900, delay: 6200, turns: 1.3, color: 0 },
  { x: 0.58, shape: 'strip', size: 9, fall: 8500, delay: 600, turns: 1.1, color: 3 },
  { x: 0.66, shape: 'dot', size: 6, fall: 7600, delay: 3400, turns: 0, color: 1 },
  { x: 0.73, shape: 'strip', size: 10, fall: 9300, delay: 8000, turns: -1.4, color: 2 },
  { x: 0.8, shape: 'square', size: 7, fall: 8000, delay: 1800, turns: 1.2, color: 4 },
  { x: 0.87, shape: 'strip', size: 8, fall: 10500, delay: 4900, turns: -1, color: 5 },
  { x: 0.93, shape: 'dot', size: 5, fall: 8700, delay: 2900, turns: 0, color: 0 },
  { x: 0.98, shape: 'strip', size: 9, fall: 7900, delay: 6600, turns: 1.5, color: 3 },
];

// One piece of confetti: falls from `from` to `to` (px from the backdrop's
// top), turning and swaying, fading in under the clouds and out at the bottom.
function ConfettiPiece({ left, shape, size, from, to, fall, delay, turns, color }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(progress, { toValue: 1, duration: fall, easing: Easing.linear, useNativeDriver: true, isInteraction: false })),
    ]);
    return runHomeAmbientAnimation(run);
  }, [progress, fall, delay]);
  const width = shape === 'strip' ? Math.round(size * 0.45) : size;
  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          left,
          width,
          height: size,
          borderRadius: shape === 'dot' ? size / 2 : 1.5,
          backgroundColor: color,
          opacity: progress.interpolate({ inputRange: [0, 0.08, 0.8, 1], outputRange: [0, 0.95, 0.95, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
            { translateX: progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 7, 0, -7, 0] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${turns * 360}deg`] }) },
            // The flutter: the piece seems to flip over as it falls.
            { scaleX: progress.interpolate({ inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], outputRange: [1, 0.25, 1, 0.25, 1, 0.25, 1, 0.25, 1] }) },
          ],
        },
      ]}
    />
  );
}

/**
 * Background of the Home "Common" area. It covers the scroll content from
 * the very top (behind the top bar) down to the end of the Common sections:
 * the bar colour behind the bar, a cloud edge where the bar ends, then a
 * light area with confetti gently falling through it, fading into the
 * page.
 * Purely decorative.
 *
 * look: 'day' | 'night' | 'rain' (the top bar's look).
 * barBottom: where the bar's solid part ends, from the top of this backdrop.
 * tint: { colors, stops } from the offer cards row — each card's colour and
 *   the scroll position where it is in front — or null. With it, the area
 *   takes a light shade of the card in view, cross-fading as the row scrolls
 *   (tintScrollX is that row's scroll).
 */
function CommonBackdrop({ width, height, barColor, barShadow, barBottom, look = 'day', tint = null, tintScrollX = null, backgroundOnly = false }) {
  const reducedMotion = useReducedMotion();
  const lookColors = AREA_COLORS[look] || AREA_COLORS.day;

  // One full-area layer per card; each fades in over the one before it as
  // the row scrolls from the earlier card to this one.
  const tintLayers = useMemo(() => {
    if (!tint || !tintScrollX || !tint.colors?.length) return null;
    let last = -Infinity;
    return tint.colors.map((color, i) => {
      const at = Math.max(Number(tint.stops?.[i]) || 0, last + 1);
      const from = last;
      last = at;
      return {
        colors: tintColors(color) || lookColors,
        opacity: i === 0
          ? 1
          : tintScrollX.interpolate({ inputRange: [from, at], outputRange: [0, 1], extrapolate: 'clamp' }),
      };
    });
  }, [tint, tintScrollX, lookColors]);

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

  return (
    <View pointerEvents="none" style={[styles.fill, { height: total }]}>
      {tintLayers ? tintLayers.map((layer, i) => (
        <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: layer.opacity }]}>
          <LinearGradient
            colors={layer.colors}
            locations={[areaTop, fadeStart, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )) : (
        <LinearGradient
          colors={lookColors}
          locations={[areaTop, fadeStart, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Confetti falls gently from behind the clouds, behind the cards. */}
      {backgroundOnly || reducedMotion || total - solid < 60
        ? null
        : CONFETTI.map((c, i) => (
          <ConfettiPiece
            key={i}
            left={c.x * width - c.size / 2}
            shape={c.shape}
            size={c.size}
            from={solid - 8}
            to={total - c.size - 6}
            fall={c.fall}
            delay={c.delay}
            turns={c.turns}
            color={CONFETTI_COLORS[c.color]}
          />
        ))}
      {!backgroundOnly && <View style={[styles.bar, { height: solid, backgroundColor: barColor }]} />}

      {/* The bank of puffy bumps hanging from the bar, with a soft shadow. */}
      {!backgroundOnly && <Svg width={width} height={BANK_HEIGHT} style={[styles.abs, { top: solid - BANK_OVERLAP }]}>
        {bumps.map((b, i) => (
          <Circle key={`s${i}`} cx={b.cx} cy={b.cy + 2} r={b.r} fill={barShadow} opacity={0.14} />
        ))}
        <Rect x={0} y={0} width={width} height={BANK_OVERLAP} fill={barColor} />
        {bumps.map((b, i) => (
          <Circle key={`b${i}`} cx={b.cx} cy={b.cy} r={b.r} fill={barColor} />
        ))}
      </Svg>}

    </View>
  );
}

export default React.memo(CommonBackdrop);

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  abs: { position: 'absolute', left: 0 },
  confetti: { position: 'absolute', top: 0 },
});
