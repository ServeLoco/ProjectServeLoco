import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import PressableScale from '../PressableScale';
import ProductImage from '../ProductImage';
import QuantityStepper from '../QuantityStepper';

/**
 * ProductCard
 * Standard product card for lists and home dashboard.
 *
 * Props:
 *   product      - { id, name, price, unit, imageUrl, available, discountLabel }
 *   quantity     - current cart quantity
 *   onAdd        - called when Add is tapped
 *   onIncrement  - called to increase qty
 *   onDecrement  - called to decrease qty
 *   onPress      - called when card is tapped (open detail)
 *   style        - container style
 */
function ProductCard({
  product = {},
  name,
  price,
  unit,
  imageUrl,
  imageUri,
  available,
  discountLabel,
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
  style,
}) {
  const resolvedName = product.name ?? name;
  const resolvedPrice = product.price ?? price;
  const resolvedUnit = product.unit ?? unit;
  const resolvedImageUrl = product.imageUrl ?? product.imageUri ?? imageUrl ?? imageUri;
  const resolvedAvailable = product.available ?? available ?? product.isAvailable ?? true;
  const resolvedDiscountLabel = product.discountLabel ?? discountLabel;
  const isUnavailable = !resolvedAvailable;

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.card, isUnavailable && styles.unavailable, style]}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      {/* Product image */}
      <View style={styles.imageContainer}>
        <ProductImage
          uri={resolvedImageUrl}
          width="100%"
          height={layout.productCardImageHeight}
          borderRadius={radius.sm}
        />
      </View>

      {/* Discount label */}
      {resolvedDiscountLabel ? (
        <View style={styles.discountBadge}>
          <Text style={styles.discountText} numberOfLines={1}>
            {resolvedDiscountLabel}
          </Text>
        </View>
      ) : null}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {resolvedName}
        </Text>
        {resolvedUnit ? (
          <Text style={styles.unit} numberOfLines={1}>
            {resolvedUnit}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.price}>Rs. {resolvedPrice}</Text>
          {isUnavailable ? (
            <Text style={styles.unavailableLabel}>Unavailable</Text>
          ) : (
            <QuantityStepper
              quantity={quantity}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              compact
            />
          )}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: layout.productCardWidth,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unavailable: {
    opacity: 0.6,
  },
  imageContainer: {
    padding: spacing.cardPaddingSmall,
    paddingBottom: 0,
    width: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.badgeBg,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  discountText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  info: {
    padding: spacing.cardPaddingSmall,
    gap: 4,
  },
  name: {
    ...typography.label,
    color: colors.textPrimary,
  },
  unit: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  price: {
    ...typography.price,
    color: colors.textPrimary,
  },
  unavailableLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});

export default ProductCard;
