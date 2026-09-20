import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Mask, Path, Rect } from 'react-native-svg';

const MOON_COLOR = '#FFF1B8';
const MOON_SIZE = 44;
const STAR_COUNT = 16;
const STAR_COLOR = '#FFFFFF';

// A crescent: a full disc with a second, offset disc cut out of it.
function Moon() {
  return (
    <Svg width={MOON_SIZE} height={MOON_SIZE} viewBox="0 0 48 48">
      <Defs>
        <Mask id="crescentCut">
          <Rect x="0" y="0" width="48" height="48" fill="#FFFFFF" />
          <Circle cx="33" cy="17" r="16" fill="#000000" />
        </Mask>
      </Defs>
      <Circle cx="24" cy="24" r="20" fill={MOON_COLOR} mask="url(#crescentCut)" />
    </Svg>
  );
}

// A four-point sparkle.
const STAR_PATH = 'M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z';

function Star({ x, y, size, half, delay }) {
  const glow = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(glow, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow, half, delay]);

  const opacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] });
  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] });

  return (
    <Animated.View style={[styles.star, { left: x, top: y, opacity, transform: [{ scale }] }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={STAR_PATH} fill={STAR_COLOR} />
      </Svg>
    </Animated.View>
  );
}

// The night look for the Home top bar: a crescent moon that turns slowly and
// stars that twinkle at random places (a fresh random layout each time the
// screen opens). `width` is the screen width; stars are scattered between
// `minY` and `maxY` (bar coordinates), and never on top of the moon. Purely
// decorative — never touchable.
export default function NightSky({ width, minY, maxY, moonCenter }) {
  const spin = useMemo(() => new Animated.Value(0), []);
  const halo = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const turn = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 40000, easing: Easing.linear, useNativeDriver: true })
    );
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    turn.start();
    breathe.start();
    return () => {
      turn.stop();
      breathe.stop();
    };
  }, [spin, halo]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  // Random spots and rhythms, drawn once per mount as fractions of the area.
  const seeds = useMemo(
    () => Array.from({ length: STAR_COUNT }, () => ({
      u: Math.random(),
      v: Math.random(),
      size: 5 + Math.random() * 6,
      half: 700 + Math.random() * 1500,
      delay: Math.random() * 2500,
    })),
    []
  );

  const stars = seeds
    .map((seed) => ({
      ...seed,
      x: 8 + seed.u * Math.max(0, width - 16 - seed.size),
      y: minY + seed.v * Math.max(0, maxY - minY - seed.size),
    }))
    // Keep clear of the moon and its halo.
    .filter((star) => Math.hypot(star.x - moonCenter.x, star.y - moonCenter.y) > 40);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((star, i) => (
        <Star key={i} x={star.x} y={star.y} size={star.size} half={star.half} delay={star.delay} />
      ))}
      <View style={[styles.moonAnchor, { left: moonCenter.x, top: moonCenter.y }]}>
        <Animated.View style={[styles.moonHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <Animated.View style={[styles.moon, { transform: [{ rotate }] }]}>
          <Moon />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
  },
  // A 1x1 anchor at the moon's centre; the halo and moon are placed around it.
  moonAnchor: {
    position: 'absolute',
    width: 1,
    height: 1,
  },
  moonHalo: {
    position: 'absolute',
    left: -34,
    top: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 241, 184, 0.09)',
  },
  moon: {
    position: 'absolute',
    left: -MOON_SIZE / 2,
    top: -MOON_SIZE / 2,
    width: MOON_SIZE,
    height: MOON_SIZE,
  },
});
