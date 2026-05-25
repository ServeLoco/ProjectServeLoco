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
  originalPrice,
  unit,
  imageUrl,
  imageUri,
  available,
  disabled,
  discountLabel,
  isCombo,
  comboItems,
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
  style,
  imageHeight = layout.productCardImageHeight,
  compact = false,
  dense = false,
}) {
  const resolvedName = product.name ?? name;
  const resolvedPrice = product.price ?? price;
  const resolvedOriginalPrice = product.originalPrice ?? product.original_price ?? originalPrice;
  const resolvedUnit = product.unit ?? unit;
  const resolvedImageUrl = product.imageUrl ?? product.imageUri ?? imageUrl ?? imageUri;
  const resolvedDisabled = product.disabled ?? disabled ?? false;
  const resolvedAvailable = product.available ?? available ?? product.isAvailable ?? !resolvedDisabled;
  const resolvedDiscountLabel = product.discountLabel ?? discountLabel;
  const resolvedComboItems = product.comboItems ?? product.combo_items ?? comboItems ?? [];
  const resolvedIsCombo = Boolean(product.isCombo ?? product.is_combo ?? isCombo ?? resolvedComboItems.length > 0);
  const isUnavailable = !resolvedAvailable;
  const comboPreview = resolvedComboItems
    .slice(0, 3)
    .map(item => `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.name}`)
    .join(' + ');

  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.card,
        compact && styles.cardCompact,
        dense && styles.cardDense,
        resolvedIsCombo && styles.comboCard,
        isUnavailable && styles.unavailable,
        style,
      ]}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      {/* Product image */}
      <View style={[
        styles.imageContainer,
        compact && styles.imageContainerCompact,
        dense && styles.imageContainerDense,
        resolvedIsCombo && styles.comboImageContainer,
      ]}>
        <ProductImage
          uri={resolvedImageUrl}
          width="100%"
          height={imageHeight}
          borderRadius={radius.sm}
        />
      </View>

      {/* Discount label */}
      {resolvedDiscountLabel ? (
        <View style={[styles.discountBadge, resolvedIsCombo && styles.comboDiscountBadge]}>
          <Text style={styles.discountText} numberOfLines={1}>
            {resolvedDiscountLabel}
          </Text>
        </View>
      ) : null}

      <View style={[styles.info, compact && styles.infoCompact, dense && styles.infoDense]}>
        {resolvedIsCombo ? (
          <View style={[styles.comboMetaRow, dense && styles.comboMetaRowDense]}>
            <Text style={[styles.comboMetaText, dense && styles.comboMetaTextDense]} numberOfLines={1}>
              {resolvedComboItems.length || 1} item combo
            </Text>
          </View>
        ) : null}
        <Text style={[styles.name, compact && styles.nameCompact, dense && styles.nameDense]} numberOfLines={2}>
          {resolvedName}
        </Text>
        {resolvedIsCombo && comboPreview ? (
          <Text style={[styles.comboItemsText, dense && styles.comboItemsTextDense]} numberOfLines={dense ? 1 : 2}>
            {comboPreview}
          </Text>
        ) : resolvedUnit ? (
          <Text style={[styles.unit, compact && styles.unitCompact]} numberOfLines={1}>
            {resolvedUnit}
          </Text>
        ) : null}
        <View style={[styles.footer, compact && styles.footerCompact, dense && styles.footerDense]}>
          <View style={styles.priceWrap}>
            <Text style={[styles.price, compact && styles.priceCompact, dense && styles.priceDense]}>
              Rs. {resolvedPrice}
            </Text>
            {resolvedOriginalPrice ? (
              <Text style={[styles.originalPrice, dense && styles.originalPriceDense]}>
                Rs. {resolvedOriginalPrice}
              </Text>
            ) : null}
          </View>
          {isUnavailable ? (
            <Text style={styles.unavailableLabel}>Unavailable</Text>
          ) : (
            <QuantityStepper
              quantity={quantity}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              compact
              dense={dense}
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
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comboCard: {
    borderColor: colors.successLight,
    ...shadows.cardRaised,
  },
  cardCompact: {
    width: '100%',
  },
  cardDense: {
    borderRadius: radius.md,
  },
  unavailable: {
    opacity: 0.6,
  },
  imageContainer: {
    padding: spacing.sm,
    paddingBottom: 0,
    width: '100%',
  },
  imageContainerCompact: {
    padding: spacing.sm,
    paddingBottom: 0,
  },
  imageContainerDense: {
    padding: 6,
    paddingBottom: 0,
  },
  comboImageContainer: {
    backgroundColor: colors.successLight,
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
  comboDiscountBadge: {
    backgroundColor: colors.success,
  },
  discountText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  info: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  infoCompact: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  infoDense: {
    padding: spacing.xs,
    gap: 3,
  },
  comboMetaRow: {
    alignSelf: 'flex-start',
    backgroundColor: colors.successLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: 1,
  },
  comboMetaRowDense: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  comboMetaText: {
    ...typography.caption,
    color: colors.successDark,
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  comboMetaTextDense: {
    fontSize: 8,
  },
  name: {
    ...typography.label,
    color: colors.textPrimary,
  },
  nameCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  nameDense: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
  unit: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  unitCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  comboItemsText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  comboItemsTextDense: {
    fontSize: 9,
    lineHeight: 11,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  footerCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  footerDense: {
    marginTop: 2,
    gap: 4,
  },
  price: {
    ...typography.price,
    color: colors.textPrimary,
  },
  priceWrap: {
    flexShrink: 1,
  },
  priceCompact: {
    fontSize: 13,
    fontWeight: '800',
  },
  priceDense: {
    fontSize: 11,
  },
  originalPrice: {
    ...typography.caption,
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  originalPriceDense: {
    fontSize: 9,
  },
  unavailableLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});

export default ProductCard;
