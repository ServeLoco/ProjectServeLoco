import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import PressableScale from '../PressableScale';
import ProductImage from '../ProductImage';

/**
 * CategoryCard
 * Category grid card with image, name, and optional product count.
 *
 * Props:
 *   category     - { id, name, imageUrl, productCount }
 *   onPress      - tap handler
 *   style        - container style
 */
function CategoryCard({
  category = {},
  name,
  imageUrl,
  imageUri,
  onPress,
  style,
  imageHeight = 56,
  imageWidth,
}) {
  const resolvedName = category.name ?? name;
  const resolvedImageUrl = category.imageUrl ?? category.imageUri ?? imageUrl ?? imageUri;

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.card, style]}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      <View style={[styles.imageWrapper, { height: imageHeight, width: imageWidth || '100%' }]}>
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

const styles = StyleSheet.create({
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
});

export default CategoryCard;
