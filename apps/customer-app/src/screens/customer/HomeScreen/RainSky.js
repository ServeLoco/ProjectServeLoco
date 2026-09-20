import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import SkyCloud from './SkyCloud';

const DROP_COUNT = 54;
const DROP_COLOR = '96, 118, 150';
const SLANT_DEG = 12;
// Sideways travel per pixel fallen: the drops lean to the left as they fall.
const SLANT = Math.tan((SLANT_DEG * Math.PI) / 180);

// Three greys, darkest and biggest at the back of the bar, drifting at their own pace.
const CLOUDS = [
  { color: '#A5ABB4', scale: 1.9, dy: -6, duration: 62000, phase: 0.12 },
  { color: '#B9BEC6', scale: 1.5, dy: 10, duration: 46000, phase: 0.55 },
  { color: '#969DA8', scale: 1.25, dy: 0, duration: 78000, phase: 0.82 },
];

function Drop({ x, len, thickness, opacity, duration, phase, height }) {
  const fall = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(fall, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [fall, duration]);

  // Top of the bar to its bottom, leaning left. The loop restarts at 0, so the
  // starting phase is baked into the interpolation: fall on to the bottom,
  // jump back to the top, then fall down to where it began.
  const travel = height + len;
  const yAt = (p) => -len + travel * p;
  const xAt = (p) => x - SLANT * travel * p;
  const inputRange = [0, 1 - phase, 1 - phase + 0.0001, 1];
  const translateY = fall.interpolate({ inputRange, outputRange: [yAt(phase), yAt(1), yAt(0), yAt(phase)] });
  const translateX = fall.interpolate({ inputRange, outputRange: [xAt(phase), xAt(1), xAt(0), xAt(phase)] });

  return (
    <Animated.View
      style={[
        styles.drop,
        {
          width: thickness,
          height: len,
          borderRadius: thickness / 2,
          backgroundColor: `rgba(${DROP_COLOR}, ${opacity})`,
          transform: [{ translateX }, { translateY }, { rotate: `${SLANT_DEG}deg` }],
        },
      ]}
    />
  );
}

// The rain look for the Home top bar: grey clouds drifting across the top and
// rain falling from them down to the search bar (the drops end at the bar's
// bottom edge). `width` is the screen width, `minY` the top of the bar in bar
// coordinates (behind the status bar) and `bottom` its bottom edge. Purely
// decorative — never touchable.
export default function RainSky({ width, minY, bottom }) {
  const height = Math.max(0, bottom - minY);

  // Random spots and speeds, drawn once per mount as fractions.
  const seeds = useMemo(
    () => Array.from({ length: DROP_COUNT }, () => ({
      u: Math.random(),
      len: 9 + Math.random() * 8,
      thickness: Math.random() < 0.3 ? 2 : 1.5,
      opacity: 0.35 + Math.random() * 0.35,
      duration: 650 + Math.random() * 650,
      phase: Math.random(),
    })),
    []
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.rain, { top: minY, height }]}>
        {seeds.map((seed, i) => (
          <Drop
            key={i}
            // Spread past the right edge too, so the leftward lean still fills the left side.
            x={seed.u * (width + SLANT * height)}
            len={seed.len}
            thickness={seed.thickness}
            opacity={seed.opacity}
            duration={seed.duration}
            phase={seed.phase}
            height={height}
          />
        ))}
      </View>
      {CLOUDS.map((cloud, i) => (
        <SkyCloud
          key={i}
          top={minY + cloud.dy}
          width={width}
          color={cloud.color}
          scale={cloud.scale}
          duration={cloud.duration}
          phase={cloud.phase}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the drops at the bar's bottom edge, where they meet the search bar.
  rain: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  drop: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
