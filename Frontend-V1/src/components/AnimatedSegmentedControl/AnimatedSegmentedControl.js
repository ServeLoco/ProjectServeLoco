import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, easing, radius, shadows, smallMs, spacing, typography } from '../../theme';
import { useReducedMotion } from '../../utils';

function AnimatedSegmentedControl({ options = [], value, onChange, style }) {
  const reducedMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useRef(new Animated.Value(Math.max(options.indexOf(value), 0))).current;
  const optionCount = options.length;

  useEffect(() => {
    const nextIndex = Math.max(options.indexOf(value), 0);
    Animated.timing(progress, {
      toValue: nextIndex,
      duration: reducedMotion ? 0 : smallMs,
      easing,
      useNativeDriver: false,
    }).start();
  }, [options, progress, reducedMotion, value]);

  if (!optionCount) return null;

  const indicatorWidth = optionCount && trackWidth ? (trackWidth - 6) / optionCount : 0;
  const translateX = progress.interpolate({
    inputRange: options.map((_, index) => index),
    outputRange: options.map((_, index) => index * indicatorWidth),
  });

  return (
    <View
      style={[styles.track, style]}
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.activeIndicator,
          {
            width: indicatorWidth,
            transform: [{ translateX }],
          },
        ]}
      />
      {options.map(option => {
        const isActive = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange?.(option)}
            style={styles.segment}
            android_ripple={{ color: colors.overlayLight }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option}
          >
            <Text style={[styles.label, isActive && styles.activeLabel]} numberOfLines={1}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.bgInput,
    borderRadius: radius.pill,
    padding: 2,
    height: 40,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  activeIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    ...shadows.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    zIndex: 1,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  activeLabel: {
    ...typography.labelLarge,
    color: colors.primaryText,
    fontWeight: '700',
  },
});

export default AnimatedSegmentedControl;
