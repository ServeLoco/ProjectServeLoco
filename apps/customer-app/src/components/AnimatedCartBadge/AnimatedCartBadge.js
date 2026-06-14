import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, motionConfig, radius, spacing, typography } from '../../theme';
import { useReducedMotion } from '../../utils';

function AnimatedCartBadge({ count = 0, style }) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!count || reducedMotion) return;

    Animated.sequence([
      Animated.timing(scale, { ...motionConfig.tap, toValue: 1.2 }),
      Animated.timing(scale, { ...motionConfig.tap, toValue: 1 }),
    ]).start();
  }, [count, reducedMotion, scale]);

  if (!count) return null;

  return (
    <Animated.View style={[styles.badge, { transform: [{ scale }] }, style]}>
      <Text style={styles.text} numberOfLines={1}>
        {count > 99 ? '99+' : count}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  text: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
});

export default React.memo(AnimatedCartBadge);
