import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
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
}) {
  const resolvedName = category.name ?? name;
  const resolvedImageUrl = category.imageUrl ?? category.imageUri ?? imageUrl ?? imageUri;
  const resolvedProductCount = category.productCount ?? category.count ?? productCount ?? count;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      <ProductImage
        uri={resolvedImageUrl}
        width={layout.categoryCardWidth - 16}
        height={56}
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
    </TouchableOpacity>
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
    ...shadows.xs,
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
