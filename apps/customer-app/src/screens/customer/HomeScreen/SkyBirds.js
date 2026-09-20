import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const BIRD_COLOR = '#111827';

// `y` is the offset below the band's top, `duration` one full crossing of the
// screen, `phase` where along the crossing the bird starts (so they never
// move in a group), `flap` one full wing beat.
const BIRDS = [
  { size: 22, y: 10, duration: 16000, phase: 0.2, flap: 520 },
  { size: 16, y: 28, duration: 21000, phase: 0.6, flap: 420 },
  { size: 12, y: 2, duration: 26000, phase: 0.88, flap: 380 },
];

function Bird({ size, y, duration, phase, flap, width }) {
  const travel = useMemo(() => new Animated.Value(0), []);
  const beat = useMemo(() => new Animated.Value(0), []);
  const bob = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const flight = Animated.loop(
      Animated.timing(travel, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    const wings = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: flap / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: flap / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const glide = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    flight.start();
    wings.start();
    glide.start();
    return () => {
      flight.stop();
      wings.stop();
      glide.stop();
    };
  }, [travel, beat, bob, duration, flap]);

  // Right to left across the screen. The loop restarts at 0, so the starting
  // phase is baked into the interpolation: run on to the far side, jump back
  // to the near side, then run up to where it began.
  const xStart = width + size;
  const xEnd = -size * 2;
  const at = (p) => xStart + (xEnd - xStart) * p;
  const translateX = travel.interpolate({
    inputRange: [0, 1 - phase, 1 - phase + 0.0001, 1],
    outputRange: [at(phase), xEnd, xStart, at(phase)],
  });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] });
  const scaleY = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] });

  return (
    <Animated.View style={[styles.bird, { top: y, transform: [{ translateX }, { translateY }] }]}>
      <Animated.View style={{ transform: [{ scaleY }] }}>
        <Svg width={size} height={size / 2} viewBox="0 0 24 12">
          <Path d="M1 4 Q6 0 12 9 Q18 0 23 4" stroke={BIRD_COLOR} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

// Three small black birds gliding across the top bar, flapping. `top` is where
// their band starts; `width` the screen width. Purely decorative — never touchable.
export default function SkyBirds({ top = 0, width }) {
  return (
    <View pointerEvents="none" style={[styles.band, { top }]}>
      {BIRDS.map((bird) => (
        <Bird key={bird.size} {...bird} width={width} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
  },
  bird: {
    position: 'absolute',
    left: 0,
  },
});
