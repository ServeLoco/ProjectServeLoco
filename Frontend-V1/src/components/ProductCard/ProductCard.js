import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import PressableScale from '../PressableScale';
import ProductImage from '../ProductImage';
import QuantityStepper from '../QuantityStepper';

/**
 * ProductCard
 * Premium, polished product card for lists and home dashboard.
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
  const resolvedComboItems = product.comboItems ?? product.combo_items ?? comboItems ?? [];
  const resolvedIsCombo = Boolean(product.isCombo ?? product.is_combo ?? isCombo ?? resolvedComboItems.length > 0);
  const isUnavailable = !resolvedAvailable;

  // Calculate savings and discount percentage
  const savings = resolvedOriginalPrice && Number(resolvedOriginalPrice) > Number(resolvedPrice)
    ? Math.round(Number(resolvedOriginalPrice) - Number(resolvedPrice))
    : 0;

  const discountPct = resolvedOriginalPrice && Number(resolvedOriginalPrice) > Number(resolvedPrice)
    ? Math.round(((Number(resolvedOriginalPrice) - Number(resolvedPrice)) / Number(resolvedOriginalPrice)) * 100)
    : 0;

  // Auto-generate discount label if not provided but savings exist
  const resolvedDiscountLabel = product.discountLabel ?? discountLabel ?? (discountPct > 0 ? `${discountPct}% OFF` : null);

  const comboItemLabels = resolvedComboItems
    .filter(Boolean)
    .map(item => `${Number(item.quantity) > 1 ? `${item.quantity}x ` : ''}${item.name || item.product_name || item.title || 'Item'}`);
  const comboCount = comboItemLabels.length || 1;

  // Gather combo item images for visual thumbnail stack
  const overlappingComboImages = resolvedComboItems
    .map(item => item.imageUrl ?? item.image_url ?? item.imageUri)
    .filter(Boolean);

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
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={resolvedName}
    >
      {/* Product image container - Full Bleed */}
      <View style={[
        styles.imageContainer,
        compact && styles.imageContainerCompact,
        dense && styles.imageContainerDense,
        resolvedIsCombo && styles.comboImageContainer,
        { height: imageHeight }
      ]}>
        <ProductImage
          uri={resolvedImageUrl}
          width="100%"
          height={imageHeight}
          borderRadius={0} // container handles overflow clipping
        />
        
        {/* Floating Overlap Combo Thumbnail Circles */}
        {resolvedIsCombo && overlappingComboImages.length > 0 ? (
          <View style={styles.comboThumbnailStack}>
            {overlappingComboImages.slice(0, 3).map((uri, idx) => (
              <View 
                key={`${uri}-${idx}`} 
                style={[
                  styles.comboThumbnailCircle,
                  { marginLeft: idx === 0 ? 0 : -8, zIndex: 10 - idx }
                ]}
              >
                <ProductImage
                  uri={uri}
                  width={20}
                  height={20}
                  borderRadius={10}
                />
              </View>
            ))}
            {overlappingComboImages.length > 3 ? (
              <View style={[styles.comboThumbnailCircle, styles.comboThumbnailMore, { marginLeft: -8, zIndex: 1 }]}>
                <Text style={styles.comboThumbnailMoreText}>+{overlappingComboImages.length - 3}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Combo Corner Pill */}
        {resolvedIsCombo ? (
          <View style={[styles.comboCornerPill, dense && styles.comboCornerPillDense]}>
            <Text style={[styles.comboCornerPillText, dense && styles.comboCornerPillTextDense]}>
              Combo
            </Text>
          </View>
        ) : null}

        {/* Discount Badge */}
        {resolvedDiscountLabel ? (
          <View style={[styles.discountBadge, resolvedIsCombo && styles.comboDiscountBadge]}>
            <Text style={styles.discountText} numberOfLines={1}>
              {resolvedDiscountLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Info Section */}
      <View style={[styles.info, compact && styles.infoCompact, dense && styles.infoDense]}>
        {resolvedIsCombo ? (
          <View style={[styles.comboMetaRow, dense && styles.comboMetaRowDense]}>
            <Text style={[styles.comboMetaText, dense && styles.comboMetaTextDense]} numberOfLines={1}>
              Bundle Deal
            </Text>
            <Text style={[styles.comboCountText, dense && styles.comboCountTextDense]} numberOfLines={1}>
              {comboCount} Items
            </Text>
          </View>
        ) : null}

        <Text 
          style={[
            styles.name, 
            compact && styles.nameCompact, 
            dense && styles.nameDense, 
            resolvedIsCombo && styles.comboName
          ]} 
          numberOfLines={2}
        >
          {resolvedName}
        </Text>

        {resolvedIsCombo && comboItemLabels.length > 0 ? (
          <Text style={[styles.comboSubtitle, dense && styles.comboSubtitleDense]} numberOfLines={1}>
            {comboItemLabels.join(' + ')}
          </Text>
        ) : resolvedUnit ? (
          <Text style={[styles.unit, compact && styles.unitCompact]} numberOfLines={1}>
            {resolvedUnit}
          </Text>
        ) : null}

        <View style={[styles.footer, compact && styles.footerCompact, dense && styles.footerDense, resolvedIsCombo && styles.comboFooter]}>
          <View style={styles.priceRow}>
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
            
            {/* Savings Pill */}
            {savings > 0 && !dense ? (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>Save Rs. {savings}</Text>
              </View>
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
    borderRadius: radius.xl, // Premium rounded corner
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ECEFF1', // subtle border
    ...shadows.card,
  },
  comboCard: {
    backgroundColor: '#FFFDFB', // Soft warm cream
    borderColor: '#FFE5D9', // Subtle saffron tint border
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: colors.saffron,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  cardCompact: {
    width: '100%',
  },
  cardDense: {
    borderRadius: radius.lg,
  },
  unavailable: {
    opacity: 0.5,
  },
  imageContainer: {
    width: '100%',
    backgroundColor: '#F8F9FA', // soft backdrop for transparent images
    position: 'relative',
    overflow: 'hidden',
  },
  imageContainerCompact: {
    // inherits full width
  },
  imageContainerDense: {
    // inherits full width
  },
  comboImageContainer: {
    backgroundColor: '#FFF3EB',
  },
  comboCornerPill: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    borderTopRightRadius: radius.xl, // align with card top corner
    borderBottomLeftRadius: radius.md,
    backgroundColor: '#0E1116', // Slate dark backdrop
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  comboCornerPillDense: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopRightRadius: radius.lg,
  },
  comboCornerPillText: {
    ...typography.caption,
    color: '#FF7A3A', // glowing golden accent
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  comboCornerPillTextDense: {
    fontSize: 7.5,
    lineHeight: 9,
  },
  discountBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
    backgroundColor: colors.badgeBg, // saffron highlight
    borderTopLeftRadius: radius.xl, // align with card top-left corner
    borderBottomRightRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  comboDiscountBadge: {
    backgroundColor: colors.badgeBg,
  },
  discountText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  info: {
    padding: spacing.sm,
    gap: spacing.xs - 2,
  },
  infoCompact: {
    padding: spacing.sm,
    gap: spacing.xs - 2,
  },
  infoDense: {
    padding: spacing.xs,
    gap: 2,
  },
  comboMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  comboMetaRowDense: {
    marginBottom: 0,
  },
  comboMetaText: {
    ...typography.caption,
    color: colors.saffronDark,
    fontWeight: '900',
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  comboMetaTextDense: {
    fontSize: 7.5,
  },
  comboCountText: {
    ...typography.caption,
    color: colors.successDark,
    backgroundColor: colors.successLight,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '800',
  },
  comboCountTextDense: {
    fontSize: 7,
    lineHeight: 8.5,
    paddingHorizontal: 4,
  },
  name: {
    ...typography.label,
    color: colors.textPrimary,
    textAlign: 'left', // Clean alignment
    alignSelf: 'stretch',
    fontWeight: '600',
  },
  nameCompact: {
    fontSize: 12.5,
    lineHeight: 15,
  },
  nameDense: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
  },
  comboName: {
    fontWeight: '700',
    textAlign: 'left',
  },
  unit: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'left',
  },
  unitCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  comboSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10.5,
    lineHeight: 13,
    textAlign: 'left',
  },
  comboSubtitleDense: {
    fontSize: 9,
    lineHeight: 11,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  footerCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  footerDense: {
    marginTop: 3,
    gap: 3,
  },
  comboFooter: {
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#FFF0E7',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    ...typography.price,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  priceCompact: {
    fontSize: 13.5,
  },
  priceDense: {
    fontSize: 11.5,
  },
  originalPrice: {
    ...typography.caption,
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
    fontSize: 11,
  },
  originalPriceDense: {
    fontSize: 9,
  },
  savingsBadge: {
    backgroundColor: '#EAFDF5', // Soft green background
    borderRadius: radius.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  savingsText: {
    color: colors.successDark,
    fontSize: 9,
    fontWeight: '800',
  },
  unavailableLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  
  // Avatar-style combo thumbnails
  comboThumbnailStack: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 15,
  },
  comboThumbnailCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  comboThumbnailMore: {
    backgroundColor: '#FF7A3A',
    borderColor: '#FFFFFF',
  },
  comboThumbnailMoreText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
});

export default ProductCard;
