import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SUN_GOLD = '#FFC93C';
const SUN_GOLD_CLEAR = 'rgba(255, 201, 60, 0)';
const RAY_COUNT = 9;
const RAY_THICKNESS = 2;
// Beams fan from straight down (90°) to straight left (180°) — clockwise from
// the +x axis, like React Native's rotate — so they cross the bar diagonally.
const FIRST_ANGLE = 100;
const LAST_ANGLE = 180;
const RAY_STAGGER_MS = 300;
const RAY_HALF_CYCLE_MS = 1600;

// Length of the beam from the sun's centre until it runs off the bar: the
// left screen edge (`width` away) or the bottom of the bar (`height` away),
// whichever it reaches first.
function rayLength(angleDeg, width, height) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.abs(Math.cos(rad));
  const dy = Math.abs(Math.sin(rad));
  const toLeft = dx > 0.001 ? width / dx : Infinity;
  const toBottom = dy > 0.001 ? height / dy : Infinity;
  return Math.max(0, Math.min(toLeft, toBottom));
}

function Ray({ angle, length, index }) {
  const progress = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    // Every beam has the same period; the delays offset them so a wave of
    // light runs from the first beam to the last, again and again.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * RAY_STAGGER_MS),
        Animated.timing(progress, { toValue: 1, duration: RAY_HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: RAY_HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.delay((RAY_COUNT - 1 - index) * RAY_STAGGER_MS),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress, index]);

  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const scaleX = progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  // The wrapper is centred on the sun and turned to the beam's angle; only its
  // right half is drawn, so the beam grows outward from the sun when scaled.
  return (
    <View
      style={[
        styles.rayWrap,
        { left: -length, width: length * 2, transform: [{ rotate: `${angle}deg` }] },
      ]}
    >
      <Animated.View style={[styles.rayInner, { opacity, transform: [{ scaleX }] }]}>
        <LinearGradient
          colors={[SUN_GOLD, SUN_GOLD_CLEAR]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ marginLeft: length, width: length, height: RAY_THICKNESS }}
        />
      </Animated.View>
    </View>
  );
}

// A sun sitting in a screen corner with thin beams reaching diagonally across
// the bar to the far side, brightening one after another. The disc pulses
// softly. `style` positions the sun's centre (top / right); `width` and
// `height` are how far the beams may travel (to the left edge / bar bottom).
// Purely decorative — never touchable.
export default function SunCorner({ style, width, height }) {
  const pulse = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const discScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  const rays = useMemo(() => {
    const step = (LAST_ANGLE - FIRST_ANGLE) / (RAY_COUNT - 1);
    return Array.from({ length: RAY_COUNT }, (_, i) => {
      const angle = FIRST_ANGLE + step * i;
      return { angle, length: rayLength(angle, width, height) };
    });
  }, [width, height]);

  return (
    <View pointerEvents="none" style={[styles.anchor, style]}>
      {rays.map((ray, i) => (
        <Ray key={ray.angle} angle={ray.angle} length={ray.length} index={i} />
      ))}
      <Animated.View style={[styles.glow, { transform: [{ scale: discScale }] }]} />
      <View style={styles.core} />
    </View>
  );
}

const styles = StyleSheet.create({
  // A 1x1 anchor at the sun's centre; everything else is placed around it.
  anchor: {
    position: 'absolute',
    width: 1,
    height: 1,
  },
  rayWrap: {
    position: 'absolute',
    top: -RAY_THICKNESS / 2,
    height: RAY_THICKNESS,
  },
  rayInner: {
    width: '100%',
    height: RAY_THICKNESS,
  },
  glow: {
    position: 'absolute',
    left: -40,
    top: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 201, 60, 0.35)',
  },
  core: {
    position: 'absolute',
    left: -24,
    top: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SUN_GOLD,
  },
});
