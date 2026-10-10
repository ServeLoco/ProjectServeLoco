import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  left: `${5 + (i * 29) % 90}%`,
  top: `${24 + (i * 17) % 66}%`,
  size: 1.5 + (i % 3) * 0.75,
  duration: 8000 + (i % 7) * 1000,
  phase: (i + 1) / 20,
  drift: i % 2 ? -22 : 26,
}));

function Glow({ id }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 320">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#FF9B32" stopOpacity="0.22" />
          <Stop offset="0.4" stopColor="#FF700E" stopOpacity="0.09" />
          <Stop offset="1" stopColor="#FF700E" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="320" height="320" fill={`url(#${id})`} />
    </Svg>
  );
}

function AuthBackdrop({ reducedMotion, focused }) {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const drift = useRef(new Animated.Value(0)).current;
  const particles = useRef(PARTICLES.map((particle) => new Animated.Value(particle.phase))).current;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reducedMotion || !appActive || !focused) return undefined;
    const timing = { useNativeDriver: true, isInteraction: false };
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), ...timing }),
      Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), ...timing }),
    ]));
    const runs = particles.map((value, i) => {
      const { phase, duration } = PARTICLES[i];
      value.setValue(phase);
      return Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: duration * (1 - phase), easing: Easing.linear, ...timing }),
        // Explicit zero-duration reset: a loop otherwise resets to the phase
        // at which it started, leaving the lower half of the path unvisited.
        Animated.loop(Animated.sequence([
          Animated.timing(value, { toValue: 0, duration: 0, ...timing }),
          Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, ...timing }),
        ])),
      ]);
    });
    glow.start();
    runs.forEach((run) => run.start());
    return () => {
      glow.stop();
      runs.forEach((run) => run.stop());
    };
  }, [appActive, drift, focused, particles, reducedMotion]);

  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.backdrop}>
      <Animated.View style={[styles.glow, styles.topGlow, { transform: [
        { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [20, -30] }) },
        { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-15, 70] }) },
      ] }]}><Glow id="auth-top-glow" /></Animated.View>
      <Animated.View style={[styles.glow, styles.lowGlow, { transform: [
        { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-20, 45] }) },
        { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [35, -50] }) },
      ] }]}><Glow id="auth-low-glow" /></Animated.View>
      {PARTICLES.map((particle, i) => (
        <Animated.View key={i} style={[styles.particle, {
          left: particle.left,
          top: particle.top,
          opacity: particles[i].interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.75, 0.45, 0] }),
          transform: [
            { translateY: particles[i].interpolate({ inputRange: [0, 1], outputRange: [55, -160] }) },
            { translateX: particles[i].interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, particle.drift, 8] }) },
          ],
        }]}>
          <View style={styles.particleGlow} />
          <View style={{ width: particle.size, height: particle.size, borderRadius: particle.size, backgroundColor: '#FF9B32' }} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#070707', overflow: 'hidden' },
  glow: { position: 'absolute', width: 360, height: 360 },
  topGlow: { top: -130, right: -210 },
  lowGlow: { top: '35%', left: -230 },
  particle: { position: 'absolute', width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  particleGlow: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,138,38,0.08)' },
});

export default memo(AuthBackdrop);
