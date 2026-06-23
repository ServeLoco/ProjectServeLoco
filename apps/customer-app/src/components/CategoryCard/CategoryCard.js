import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import PressableScale from '../PressableScale';
import ProductImage from '../ProductImage';

/**
 * CategoryCard
 * Two visual variants:
 *   - 'default' : compact card with image-on-top, label-below (legacy use)
 *   - 'hero'    : big edge-to-edge image with bold overlay label,
 *                 perfect for the home dashboard 2-col grid
 *
 * Props:
 *   category     - { id, name, imageUrl, productCount }
 *   name         - override for category.name
 *   imageUrl     - override for category.imageUrl
 *   imageUri     - shorthand for imageUrl
 *   count        - product count (rendered as a small pill on hero variant)
 *   onPress      - tap handler
 *   variant      - 'default' | 'hero'  (default: 'default')
 *   style        - container style override
 *   imageHeight  - default variant only: explicit image height
 *   imageWidth   - default variant only: explicit image width
 */
function CategoryCard({
  category = {},
  name,
  imageUrl,
  imageUri,
  count,
  onPress,
  variant = 'default',
  style,
  imageHeight,
  imageWidth,
}) {
  const resolvedName = category.name ?? name;
  const resolvedImageUrl =
    category.imageUrl ?? category.imageUri ?? imageUrl ?? imageUri;
  void count;
  void category.productCount;
  void category.count;

  if (variant === 'hero') {
    return (
      <HeroCategoryCard
        name={resolvedName}
        imageUri={resolvedImageUrl}
        onPress={onPress}
        style={style}
      />
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.card, style]}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      <View
        style={[
          styles.imageWrapper,
          { height: imageHeight, width: imageWidth || '100%' },
        ]}
      >
        <ProductImage
          uri={resolvedImageUrl}
          width="100%"
          height="100%"
          borderRadius={radius.sm}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {resolvedName}
      </Text>
    </PressableScale>
  );
}

function HeroCategoryCard({ name, imageUri, onPress, style }) {
  // Subtle shimmer sweep across the card image
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );
    sweep.start();

    return () => sweep.stop();
  }, [sweepAnim]);

  const sweepTranslateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 360],
  });

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(pressAnim, {
          toValue: 1,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(pressAnim, {
          toValue: 0,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }).start()
      }
      style={[styles.heroCard, style]}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <View style={styles.heroCardInner}>
        <ProductImage
          uri={imageUri}
          width="100%"
          height="100%"
          borderRadius={radius.lg}
          resizeMode="cover"
          priority="high"
        />

        {/* Animated diagonal shimmer sweep */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heroSweep,
            {
              transform: [
                { translateX: sweepTranslateX },
                { rotate: '-18deg' },
              ],
            },
          ]}
        />

        {/* Soft gradient scrim — fades from transparent at top to dark at bottom
            so the label always reads, with no hard edge. */}
        <LinearGradient
          colors={[
            'rgba(8,12,20,0)',
            'rgba(8,12,20,0.10)',
            'rgba(8,12,20,0.50)',
            'rgba(8,12,20,0.78)',
          ]}
          locations={[0, 0.30, 0.72, 1]}
          pointerEvents="none"
          style={StyleSheet.absoluteFillObject}
        />

        {/* Press-reactive highlight overlay */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heroPressOverlay,
            {
              opacity: pressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.18],
              }),
            },
          ]}
        />

        {/* Bottom-left label */}
        <View style={styles.heroLabelRow}>
          <Text style={styles.heroName} numberOfLines={2}>
            {name}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // ----- Default (legacy / compact) variant -----
  card: {
    width: layout.categoryCardWidth,
    height: layout.categoryCardHeight,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.labelSmall,
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
  },

  // ----- Hero (dashboard) variant -----
  heroCard: {
    width: '100%',
    aspectRatio: 0.9,
  },
  heroCardInner: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.bgSkeletonBase,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E6B800',
    shadowColor: '#B8860B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  heroSweep: {
    position: 'absolute',
    top: -120,
    bottom: -120,
    left: 0,
    width: 30,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  heroPressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  heroLabelRow: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    flex: 1,
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.1,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export default React.memo(CategoryCard);
