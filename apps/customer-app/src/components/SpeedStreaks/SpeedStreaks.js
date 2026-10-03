import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '../../utils/motionPreferences';

/**
 * Background "speed" effect for a card: thin blue streaks rushing left-to-right
 * plus a soft light sweep. Fills its parent (absolute), never takes touches,
 * and sits under whatever is rendered after it — so the card's text stays on
 * top and readable.
 *
 * `tone="light"` is for a dark/coloured card (light blue), the default is
 * for a white card (deeper blue).
 */

// top: % of the card height. speed: whole laps per loop, so the loop seams
// never show. offset: where in its lap the streak starts (0-1).
const STREAKS = [
  { top: 14, width: 46, height: 2, speed: 2, offset: 0.1 },
  { top: 30, width: 72, height: 3, speed: 1, offset: 0.55 },
  { top: 46, width: 34, height: 2, speed: 3, offset: 0.3 },
  { top: 62, width: 60, height: 2, speed: 2, offset: 0.8 },
  { top: 78, width: 40, height: 3, speed: 1, offset: 0.2 },
  { top: 88, width: 28, height: 2, speed: 3, offset: 0.65 },
];

const LOOP_MS = 2600;
const SWEEP_MS = 900;
const SWEEP_PAUSE_MS = 1700;
const SWEEP_WIDTH = 70;

// Blue (theme info500 #3B82F6 / info300 #93C5FD), kept faint so text reads.
const TONES = {
  dark: {
    streak: 'rgba(59,130,246,0.28)',
    sweep: ['rgba(59,130,246,0)', 'rgba(59,130,246,0.16)', 'rgba(59,130,246,0)'],
  },
  light: {
    streak: 'rgba(147,197,253,0.6)',
    sweep: ['rgba(147,197,253,0)', 'rgba(147,197,253,0.32)', 'rgba(147,197,253,0)'],
  },
};

export default function SpeedStreaks({ tone = 'dark', borderRadius = 0 }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const lap = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  // Each streak's place in its lap, built once so re-renders of the card do
  // not hand the native driver new nodes.
  const progresses = useMemo(
    () => STREAKS.map((s) => Animated.modulo(Animated.add(Animated.multiply(lap, s.speed), s.offset), 1)),
    [lap]
  );

  useEffect(() => {
    if (reduceMotion || !width) return undefined;
    lap.setValue(0);
    sweep.setValue(0);
    const lapLoop = Animated.loop(
      Animated.timing(lap, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true })
    );
    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(SWEEP_PAUSE_MS),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    lapLoop.start();
    sweepLoop.start();
    return () => {
      lapLoop.stop();
      sweepLoop.stop();
    };
  }, [reduceMotion, width, lap, sweep]);

  const colours = TONES[tone] || TONES.dark;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, { borderRadius }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {width > 0 && !reduceMotion && STREAKS.map((s, i) => {
        const progress = progresses[i];
        return (
          <Animated.View
            key={`${s.top}-${s.width}`}
            style={[
              styles.streak,
              {
                top: `${s.top}%`,
                width: s.width,
                height: s.height,
                borderRadius: s.height,
                backgroundColor: colours.streak,
                transform: [{
                  translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-s.width, width] }),
                }],
              },
            ]}
          />
        );
      })}
      {width > 0 && !reduceMotion && (
        <Animated.View
          style={[
            styles.sweep,
            {
              transform: [
                { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-SWEEP_WIDTH * 2, width + SWEEP_WIDTH] }) },
                { skewX: '-20deg' },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={colours.sweep}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  streak: {
    position: 'absolute',
    left: 0,
  },
  sweep: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: 0,
    width: SWEEP_WIDTH,
  },
});
