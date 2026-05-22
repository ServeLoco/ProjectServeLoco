import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, motionConfig, radius } from '../../theme';
import { useReducedMotion } from '../../utils';

/**
 * LoadingSkeleton
 * Pulsing skeleton placeholder for loading states.
 *
 * Props:
 *   width        - width of the skeleton block
 *   height       - height of the skeleton block
 *   borderRadius - corner radius (default: radius.md)
 *   style        - additional style
 */
function LoadingSkeleton({ width, height = 16, borderRadius = radius.md, style }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.72);
      return undefined;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.4,
          ...motionConfig.loop,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          ...motionConfig.loop,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

/**
 * SkeletonCard
 * Preset skeleton for a product card.
 */
function SkeletonCard({ style }) {
  return (
    <View style={[styles.card, style]}>
      <LoadingSkeleton width="100%" height={110} borderRadius={radius.sm} />
      <View style={styles.cardBody}>
        <LoadingSkeleton width="80%" height={14} style={styles.row} />
        <LoadingSkeleton width="50%" height={12} style={styles.row} />
        <LoadingSkeleton width="60%" height={30} borderRadius={radius.md} style={styles.row} />
      </View>
    </View>
  );
}

/**
 * SkeletonRow
 * Preset skeleton for a list row (orders, customers).
 */
function SkeletonRow({ style }) {
  return (
    <View style={[styles.rowContainer, style]}>
      <LoadingSkeleton width={56} height={56} borderRadius={radius.md} />
      <View style={styles.rowBody}>
        <LoadingSkeleton width="65%" height={14} style={styles.row} />
        <LoadingSkeleton width="45%" height={12} style={styles.row} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.bgSkeletonBase,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
    padding: 12,
  },
  cardBody: {
    marginTop: 10,
    gap: 6,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
  },
  rowBody: {
    flex: 1,
    gap: 8,
  },
  row: {
    borderRadius: radius.xs,
  },
});

export { LoadingSkeleton, SkeletonCard, SkeletonRow };
export default LoadingSkeleton;
