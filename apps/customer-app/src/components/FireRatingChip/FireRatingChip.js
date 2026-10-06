import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import AppIcon from '../AppIcon';
import { radius } from '../../theme';
import { useReducedMotion } from '../../utils/motionPreferences';

/**
 * The rating box of a top-rated product (above 4.8) — design 10, "fire runs
 * the edge": a dark box with the rating in warm gold, a band of fire racing
 * round its border, and three flames burning up out of its top edge with a
 * couple of embers drifting up.
 *
 * The racing border is a fire gradient spinning behind a 1.5px window (the
 * box's padding): RN has no conic gradient, and a spinning linear one sweeps
 * the bright part round the edge the same way.
 *
 * One clock drives every chip on screen: a single native-driver loop runs
 * while at least one chip is mounted, so a screen full of cards costs one
 * animation, not one per card. Each flame reads the clock at its own phase.
 * With "reduce motion" on, the flames stand still.
 */

const CYCLE_MS = 1100;
const fireClock = new Animated.Value(0);
let clockUsers = 0;
let clockLoop = null;

const startClock = () => {
  clockUsers += 1;
  if (clockLoop) return;
  clockLoop = Animated.loop(
    Animated.timing(fireClock, {
      toValue: 1,
      duration: CYCLE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }),
  );
  clockLoop.start();
};

const stopClock = () => {
  clockUsers = Math.max(0, clockUsers - 1);
  if (clockUsers > 0 || !clockLoop) return;
  clockLoop.stop();
  clockLoop = null;
  fireClock.setValue(0);
};

// Three flame tongues along the top edge (left = % of the box width): a tall
// one in the middle and a smaller one at each end.
const FLAMES = [
  { left: 2, width: 12, height: 16, phase: 0.58 },
  { left: 30, width: 17, height: 25, phase: 0.12 },
  { left: 66, width: 12, height: 17, phase: 0.83 },
];
const EMBERS = [
  { left: 24, phase: 0.2 },
  { left: 68, phase: 0.7 },
];

const phased = (phase) => Animated.modulo(Animated.add(fireClock, phase), 1);

// Outer flame (red base -> orange -> yellow tip) with a pale inner core.
const FLAME_OUTER = 'M10 0 C13 7 19 11 19 18 C19 24 15 28 10 28 C5 28 1 24 1 18 C1 11 7 7 10 0 Z';
const FLAME_CORE = 'M10 10 C12 14 15 17 15 21 C15 25 13 27 10 27 C7 27 5 25 5 21 C5 17 8 14 10 10 Z';

const FlameShape = React.memo(function FlameShape({ width, height }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 20 28">
      <Defs>
        <SvgGradient id="fireOuter" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#E3260B" />
          <Stop offset="0.55" stopColor="#FF7A12" />
          <Stop offset="1" stopColor="#FFD24A" stopOpacity="0.9" />
        </SvgGradient>
        <SvgGradient id="fireCore" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#FFB13B" />
          <Stop offset="1" stopColor="#FFF4C2" />
        </SvgGradient>
      </Defs>
      <Path d={FLAME_OUTER} fill="url(#fireOuter)" />
      <Path d={FLAME_CORE} fill="url(#fireCore)" />
    </Svg>
  );
});

const Flame = React.memo(function Flame({ flame, still }) {
  const motion = useMemo(() => {
    if (still) return null;
    const t = phased(flame.phase);
    return {
      opacity: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0.9, 1, 0.82, 1, 0.9] }),
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -1.5, 0] }) },
        { scaleY: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 1.22, 0.86, 1.12, 1] }) },
        { scaleX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.88, 1.06, 0.92, 1] }) },
      ],
    };
  }, [flame.phase, still]);

  return (
    <Animated.View
      style={[
        styles.flame,
        { left: `${flame.left}%`, width: flame.width, height: flame.height },
        motion,
      ]}
    >
      <FlameShape width={flame.width} height={flame.height} />
    </Animated.View>
  );
});

const Ember = React.memo(function Ember({ ember }) {
  const motion = useMemo(() => {
    const t = phased(ember.phase);
    return {
      opacity: t.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 0.4, 0] }),
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
        { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 2, -1] }) },
      ],
    };
  }, [ember.phase]);
  return <Animated.View style={[styles.ember, { left: `${ember.left}%` }, motion]} />;
});

const GOLD = '#FFD24A';
const RING_COLORS = ['#3A0A03', '#C81E0A', '#FF6A12', '#FFD24A', '#FF6A12', '#3A0A03'];
const RING_LOCATIONS = [0, 0.25, 0.42, 0.5, 0.58, 1];

const BorderFire = React.memo(function BorderFire({ still }) {
  const spin = useMemo(() => (still ? null : {
    transform: [{ rotate: fireClock.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
  }), [still]);
  return (
    <Animated.View pointerEvents="none" style={[styles.ringSpinner, spin]}>
      <LinearGradient
        colors={RING_COLORS}
        locations={RING_LOCATIONS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
});

function FireRatingChip({ rating, compact = false }) {
  const reducedMotion = useReducedMotion();
  const still = reducedMotion;

  useEffect(() => {
    if (still) return undefined;
    startClock();
    return stopClock;
  }, [still]);

  const label = Number(rating).toFixed(1);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Top rated, ${label} out of 5`}
    >
      {/* Flames sit behind the box, so only the part above its edge shows. */}
      <View pointerEvents="none" style={[styles.flameLayer, compact && styles.flameLayerCompact]}>
        {FLAMES.map((flame) => (
          <Flame key={flame.left} flame={flame} still={still} />
        ))}
        {still ? null : EMBERS.map((ember) => <Ember key={ember.left} ember={ember} />)}
      </View>

      <View style={styles.ring}>
        <BorderFire still={still} />
        <View style={[styles.chip, compact && styles.chipCompact]}>
          <AppIcon name="star" size={compact ? 9 : 10} color={GOLD} fill={GOLD} strokeWidth={2} />
          <Text style={[styles.text, compact && styles.textCompact]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    position: 'relative',
    marginBottom: -2,
  },
  flameLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    height: 26,
  },
  flameLayerCompact: {
    bottom: 10,
  },
  flame: {
    position: 'absolute',
    bottom: 0,
    transformOrigin: 'bottom',
  },
  ember: {
    position: 'absolute',
    bottom: 10,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFD180',
  },
  // The 1.5px padding is the window the spinning fire shows through.
  ring: {
    borderRadius: radius.pill,
    padding: 1.5,
    overflow: 'hidden',
    backgroundColor: '#3A0A03',
    shadowColor: '#FF5A1F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  ringSpinner: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 90,
    height: 90,
    marginLeft: -45,
    marginTop: -45,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#2A120A',
  },
  chipCompact: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    gap: 2,
  },
  text: {
    color: '#FFD9A8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  textCompact: {
    fontSize: 10,
  },
});

export default React.memo(FireRatingChip);
