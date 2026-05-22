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
function CategoryCard({ category = {}, onPress, style }) {
  const { name, imageUrl, productCount } = category;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <ProductImage
        uri={imageUrl}
        width={layout.categoryCardWidth - 16}
        height={56}
        borderRadius={radius.sm}
        style={styles.image}
        resizeMode="contain"
      />
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {productCount !== undefined && productCount !== null ? (
        <Text style={styles.count}>{productCount} items</Text>
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
