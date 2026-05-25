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
  const comboItemLabels = resolvedComboItems
    .filter(Boolean)
    .map(item => `${Number(item.quantity) > 1 ? `${item.quantity}x ` : ''}${item.name || item.product_name || item.title || 'Item'}`);
  const visibleComboLabels = comboItemLabels.slice(0, 2);
  const hiddenComboCount = Math.max(comboItemLabels.length - visibleComboLabels.length, 0);
  const comboCount = comboItemLabels.length || 1;

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
        {resolvedIsCombo ? (
          <>
            <View style={styles.comboImageGlow} />
            <View style={[styles.comboCornerPill, dense && styles.comboCornerPillDense]}>
              <Text style={[styles.comboCornerPillText, dense && styles.comboCornerPillTextDense]}>
                Combo
              </Text>
            </View>
          </>
        ) : null}
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
              Bundle deal
            </Text>
            <Text style={[styles.comboCountText, dense && styles.comboCountTextDense]} numberOfLines={1}>
              {comboCount} items
            </Text>
          </View>
        ) : null}
        <Text style={[styles.name, compact && styles.nameCompact, dense && styles.nameDense, resolvedIsCombo && styles.comboName]} numberOfLines={2}>
          {resolvedName}
        </Text>
        {resolvedIsCombo && visibleComboLabels.length > 0 ? (
          <View style={[styles.comboItemsWrap, dense && styles.comboItemsWrapDense]}>
            {visibleComboLabels.map((label, index) => (
              <View key={`${label}-${index}`} style={[styles.comboItemChip, dense && styles.comboItemChipDense]}>
                <Text style={[styles.comboItemChipText, dense && styles.comboItemChipTextDense]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
            {hiddenComboCount > 0 ? (
              <View style={[styles.comboItemChip, styles.comboItemMoreChip, dense && styles.comboItemChipDense]}>
                <Text style={[styles.comboItemChipText, styles.comboItemMoreText, dense && styles.comboItemChipTextDense]} numberOfLines={1}>
                  +{hiddenComboCount}
                </Text>
              </View>
            ) : null}
          </View>
        ) : resolvedUnit ? (
          <Text style={[styles.unit, compact && styles.unitCompact]} numberOfLines={1}>
            {resolvedUnit}
          </Text>
        ) : null}
        <View style={[styles.footer, compact && styles.footerCompact, dense && styles.footerDense, resolvedIsCombo && styles.comboFooter]}>
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
    backgroundColor: '#FFFDF7',
    borderColor: '#FFD7C2',
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
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFEBDD',
  },
  comboImageGlow: {
    position: 'absolute',
    right: -28,
    top: -24,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 122, 58, 0.24)',
  },
  comboCornerPill: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    ...shadows.xs,
  },
  comboCornerPillDense: {
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comboCornerPillText: {
    ...typography.caption,
    color: colors.textInverse,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  comboCornerPillTextDense: {
    fontSize: 7,
    lineHeight: 9,
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
    backgroundColor: colors.badgeBg,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: 1,
  },
  comboMetaRowDense: {
    gap: 4,
  },
  comboMetaText: {
    ...typography.caption,
    color: colors.badgeBg,
    fontWeight: '900',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  comboMetaTextDense: {
    fontSize: 7,
    lineHeight: 9,
  },
  comboCountText: {
    ...typography.caption,
    color: colors.successDark,
    backgroundColor: colors.successLight,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
  },
  comboCountTextDense: {
    fontSize: 7,
    lineHeight: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  name: {
    ...typography.label,
    color: colors.textPrimary,
    textAlign: 'center',
    alignSelf: 'stretch',
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
  comboName: {
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  unit: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  unitCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  comboItemsWrap: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    minHeight: 22,
  },
  comboItemsWrapDense: {
    gap: 3,
    minHeight: 18,
  },
  comboItemChip: {
    flex: 1,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: '#FFE0CC',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comboItemChipDense: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  comboItemChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
  },
  comboItemChipTextDense: {
    fontSize: 7,
    lineHeight: 9,
  },
  comboItemMoreChip: {
    flex: 0,
    minWidth: 34,
    backgroundColor: '#FFF3EA',
    borderColor: '#FFD7C2',
  },
  comboItemMoreText: {
    color: colors.badgeBg,
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
  comboFooter: {
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#FFE7D8',
  },
  price: {
    ...typography.price,
    color: colors.textPrimary,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    flexShrink: 1,
    flexWrap: 'wrap',
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
