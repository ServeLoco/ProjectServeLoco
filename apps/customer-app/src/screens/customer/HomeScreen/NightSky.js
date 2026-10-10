import { runHomeAmbientAnimation } from '../../../utils/homeScrollMotion';
import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const STAR_COUNT = 16;
const STAR_COLOR = '#FFFFFF';

// A four-point sparkle.
const STAR_PATH = 'M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z';

function Star({ x, y, size, half, delay }) {
  const glow = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(glow, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(glow, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ])
    );
    return runHomeAmbientAnimation(loop);
  }, [glow, half, delay]);

  const opacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] });
  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] });

  return (
    <Animated.View renderToHardwareTextureAndroid style={[styles.star, { left: x, top: y, opacity, transform: [{ scale }] }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={STAR_PATH} fill={STAR_COLOR} />
      </Svg>
    </Animated.View>
  );
}

// The night look for the Home top bar: stars that twinkle at random places
// (a fresh random layout each time the screen opens). `width` is the screen
// width; stars are scattered between `minY` and `maxY` (bar coordinates).
// Purely decorative — never touchable.
export default function NightSky({ width, minY, maxY }) {
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

  const stars = seeds.map((seed) => ({
    ...seed,
    x: 8 + seed.u * Math.max(0, width - 16 - seed.size),
    y: minY + seed.v * Math.max(0, maxY - minY - seed.size),
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((star, i) => (
        <Star key={i} x={star.x} y={star.y} size={star.size} half={star.half} delay={star.delay} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
  },
});
