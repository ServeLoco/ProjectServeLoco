import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, easing, smallMs, spacing, typography } from '../../theme';
import { useReducedMotion } from '../../utils';

function AnimatedTabItem({ active = false, icon, label, onPress, style }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: reducedMotion ? 0 : smallMs,
      easing,
      useNativeDriver: true,
    }).start();
  }, [active, progress, reducedMotion]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <Pressable onPress={onPress} style={[styles.tab, style]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
        {icon}
      </Animated.View>
      <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View style={[styles.indicator, { opacity: progress }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  iconWrap: {
    marginBottom: 2,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  activeLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
  indicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
});

export default AnimatedTabItem;
