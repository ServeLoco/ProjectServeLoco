import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
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
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
  style,
}) {
  const { name, price, unit, imageUrl, available = true, discountLabel } = product;
  const isUnavailable = !available;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, isUnavailable && styles.unavailable, style]}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      {/* Product image */}
      <ProductImage
        uri={imageUrl}
        width={layout.productCardWidth - spacing.cardPadding * 2}
        height={layout.productCardImageHeight}
        borderRadius={radius.sm}
        style={styles.image}
      />

      {/* Discount label */}
      {discountLabel ? (
        <View style={styles.discountBadge}>
          <Text style={styles.discountText} numberOfLines={1}>
            {discountLabel}
          </Text>
        </View>
      ) : null}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {unit ? (
          <Text style={styles.unit} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.price}>Rs. {price}</Text>
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: layout.productCardWidth,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  unavailable: {
    opacity: 0.6,
  },
  image: {
    margin: spacing.cardPaddingSmall,
    marginBottom: 0,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.error,
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
