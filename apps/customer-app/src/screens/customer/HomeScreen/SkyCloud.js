import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

const CLOUD_WIDTH = 68;
const CLOUD_HEIGHT = 34;

// A cloud drifting slowly left to right, bobbing a little. `top` is its height
// in the bar, `width` the screen width. Defaults give the small white day
// cloud; `color`, `scale`, `duration` (one pass across the screen) and
// `phase` (where along the pass it begins) let the rain scene use several
// bigger grey ones. Purely decorative — never touchable.
export default function SkyCloud({
  top = 0,
  width,
  color = '#FFFFFF',
  scale = 1,
  duration = 48000,
  phase = 0.3,
}) {
  const cloudWidth = CLOUD_WIDTH * scale;
  const cloudHeight = CLOUD_HEIGHT * scale;
  const travel = useMemo(() => new Animated.Value(0), []);
  const bob = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const drift = Animated.loop(
      Animated.timing(travel, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    drift.start();
    float.start();
    return () => {
      drift.stop();
      float.stop();
    };
  }, [travel, bob, duration]);

  // The loop restarts at 0, so the starting phase is baked into the
  // interpolation: run on to the right edge, jump back to the left, then run
  // up to where it began.
  const xStart = -cloudWidth;
  const xEnd = width;
  const at = (p) => xStart + (xEnd - xStart) * p;
  const translateX = travel.interpolate({
    inputRange: [0, 1 - phase, 1 - phase + 0.0001, 1],
    outputRange: [at(phase), xEnd, xStart, at(phase)],
  });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] });

  return (
    <View pointerEvents="none" style={[styles.band, { top, height: cloudHeight }]}>
      <Animated.View style={[styles.cloud, { transform: [{ translateX }, { translateY }] }]}>
        <Svg width={cloudWidth} height={cloudHeight} viewBox="0 0 68 34">
          <Circle cx={21} cy={21} r={11} fill={color} fillOpacity={0.95} />
          <Circle cx={34} cy={15} r={14} fill={color} fillOpacity={0.95} />
          <Circle cx={48} cy={21} r={11} fill={color} fillOpacity={0.95} />
          <Rect x={10} y={20} width={48} height={12} rx={6} fill={color} fillOpacity={0.95} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  cloud: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
