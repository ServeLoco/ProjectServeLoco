import React from 'react';
import { StyleSheet, Text } from 'react-native';
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
  productCount,
  count,
  onPress,
  style,
  imageHeight = 56,
  imageWidth,
}) {
  const resolvedName = category.name ?? name;
  const resolvedImageUrl = category.imageUrl ?? category.imageUri ?? imageUrl ?? imageUri;
  const resolvedProductCount = category.productCount ?? category.count ?? productCount ?? count;

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.card, style]}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      <ProductImage
        uri={resolvedImageUrl}
        width={imageWidth || layout.categoryCardWidth - 16}
        height={imageHeight}
        borderRadius={radius.sm}
        style={styles.image}
        resizeMode="contain"
      />
      <Text style={styles.name} numberOfLines={2}>
        {resolvedName}
      </Text>
      {resolvedProductCount !== undefined && resolvedProductCount !== null ? (
        <Text style={styles.count}>{resolvedProductCount} items</Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: layout.categoryCardWidth,
    minHeight: layout.categoryCardHeight,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  count: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default CategoryCard;
