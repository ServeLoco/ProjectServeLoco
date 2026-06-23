import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, layout } from '../../theme';
import ProductImage from '../ProductImage';
import QuantityStepper from '../QuantityStepper';
import AppIcon from '../AppIcon';

/**
 * ProductCard
 * Full-bleed image card matching the CategoryCard hero style:
 *   - Big image fills the whole card
 *   - Dark gradient strip at the bottom for white overlay text
 *   - Product name in white on the scrim
 *   - Discount % pill on the scrim
 *   - Add button at the bottom-right of the card
 *
 * Tapping the image opens the product detail (onPress).
 * Tapping the Add button adds 1 to cart.
 * Once added, the Add button swaps to the - qty + stepper inline.
 *
 * Props:
 *   product      - { id, name, price, unit, imageUrl, available, discountLabel }
 *   quantity     - current cart quantity
 *   onAdd        - called when Add is tapped
 *   onIncrement  - called to increase qty
 *   onDecrement  - called to decrease qty
 *   onPress      - called when card body is tapped (open detail)
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
  compact = false,
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

  const pressAnim = useRef(new Animated.Value(0)).current;

  const discountPct = resolvedOriginalPrice && Number(resolvedOriginalPrice) > Number(resolvedPrice)
    ? Math.round(((Number(resolvedOriginalPrice) - Number(resolvedPrice)) / Number(resolvedOriginalPrice)) * 100)
    : 0;

  const resolvedDiscountLabel = product.discountLabel ?? discountLabel ?? (discountPct > 0 ? `${discountPct}% OFF` : null);

  const overlappingComboImages = resolvedComboItems
    .map(item => item.imageUrl ?? item.image_url ?? item.imageUri)
    .filter(Boolean);

  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 0,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  const cardScale = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.97],
  });

  return (
    <Animated.View style={[styles.card, compact && styles.cardCompact, style, { transform: [{ scale: cardScale }] }]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.touchable}
        accessibilityRole="button"
        accessibilityLabel={resolvedName}
      >
        <View style={[styles.cardInner, compact && styles.cardInnerCompact]}>
          {/* Full-bleed image */}
          <ProductImage
            uri={resolvedImageUrl}
            width="100%"
            height="100%"
            borderRadius={radius.lg}
            resizeMode="cover"
            priority="high"
          />

          {/* Combo tag (top-left) */}
          {resolvedIsCombo ? (
            <View style={styles.comboTag}>
              <AppIcon name="shoppingBag" size={9} color={colors.saffronDark} strokeWidth={2.6} />
              <Text style={styles.comboTagText}>COMBO</Text>
            </View>
          ) : null}

          {/* Discount ribbon (top-right) — green gradient */}
          {resolvedDiscountLabel ? (
            <View style={styles.discountRibbon}>
              <LinearGradient
                colors={[colors.success, colors.successDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.discountText} numberOfLines={1}>
                {resolvedDiscountLabel}
              </Text>
            </View>
          ) : null}

          {/* Floating combo thumbnails (bottom-left, above scrim) */}
          {resolvedIsCombo && overlappingComboImages.length > 0 ? (
            <View style={styles.comboThumbnailStack}>
              {overlappingComboImages.slice(0, 3).map((uri, idx) => (
                <View
                  key={`${uri}-${idx}`}
                  style={[
                    styles.comboThumbnailCircle,
                    { marginLeft: idx === 0 ? 0 : -7, zIndex: 10 - idx },
                  ]}
                >
                  <ProductImage uri={uri} width={20} height={20} borderRadius={10} priority="low" />
                </View>
              ))}
              {overlappingComboImages.length > 3 ? (
                <View style={[styles.comboThumbnailCircle, styles.comboThumbnailMore, { marginLeft: -7, zIndex: 1 }]}>
                  <Text style={styles.comboThumbnailMoreText}>+{overlappingComboImages.length - 3}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Dark gradient strip at the bottom — white text overlay */}
          <LinearGradient
            colors={[
              'rgba(8,12,20,0)',
              'rgba(8,12,20,0.55)',
              'rgba(8,12,20,0.85)',
            ]}
            locations={[0, 0.35, 1]}
            pointerEvents="none"
            style={styles.bottomScrim}
          />

          {/* Top-right unit badge (e.g. "500 g" or "1 L") */}
          {resolvedUnit ? (
            <View style={styles.unitBadge}>
              <Text style={styles.unitBadgeText} numberOfLines={1}>
                {resolvedUnit}
              </Text>
            </View>
          ) : null}

          {/* Bottom dark scrim for white text legibility */}
          <LinearGradient
            colors={[
              'rgba(8,12,20,0)',
              'rgba(8,12,20,0.55)',
              'rgba(8,12,20,0.85)',
            ]}
            locations={[0, 0.35, 1]}
            pointerEvents="none"
            style={styles.bottomScrim}
          />

          {/* Bottom strip: full-width name, then price + Add button row */}
          <View style={styles.bottomStrip}>
            {/* Product name — full width, no flex constraint */}
            <Text style={styles.name} numberOfLines={2}>
              {resolvedName}
            </Text>

            {/* Price row + Add button side-by-side */}
            <View style={styles.priceActionRow}>
              <View style={styles.priceBlock}>
                <View style={styles.priceRow}>
                  <Text style={styles.price} numberOfLines={1}>
                    ₹{resolvedPrice}
                  </Text>
                  {resolvedOriginalPrice ? (
                    <Text style={styles.originalPrice} numberOfLines={1}>
                      ₹{Math.floor(Number(resolvedOriginalPrice))}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Add button (or stepper when quantity > 0) at right */}
              <View style={styles.bottomRight}>
                {isUnavailable ? (
                  <View style={styles.unavailablePill}>
                    <Text style={styles.unavailableText}>Out</Text>
                  </View>
                ) : quantity > 0 ? (
                  <QuantityStepper
                    quantity={quantity}
                    onAdd={onAdd}
                    onIncrement={onIncrement}
                    onDecrement={onDecrement}
                    disabled={isUnavailable}
                    compact
                    dense
                  />
                ) : (
                  <TouchableOpacity
                    onPress={onAdd}
                    disabled={isUnavailable}
                    activeOpacity={0.8}
                    style={styles.addButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${resolvedName} to cart`}
                  >
                    <LinearGradient
                      colors={[colors.saffron, colors.saffronDark]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <AppIcon name="plus" size={12} color={colors.textInverse} strokeWidth={2.8} />
                    <Text style={styles.addLabel}>Buy</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ----- Card container -----
  card: {
    width: layout.productCardWidth,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    shadowColor: '#B8860B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E6B800',
  },
  cardCompact: {
    width: '100%',
  },

  // Touchable wraps the inner card to handle press feedback
  touchable: {
    width: '100%',
  },

  // Inner aspect-ratio wrapper
  cardInner: {
    width: '100%',
    aspectRatio: 0.78,
    backgroundColor: colors.bgSkeletonBase,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  cardInnerCompact: {
    aspectRatio: 0.82,
  },

  // Combo tag (top-left)
  comboTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0E1116',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 3,
    elevation: 2,
    zIndex: 10,
  },
  comboTagText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.saffronDark,
    letterSpacing: 0.5,
  },

  // Discount ribbon (top-right) with saffron gradient
  discountRibbon: {
    position: 'absolute',
    top: 0,
    right: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderBottomLeftRadius: radius.md,
    shadowColor: colors.successDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.30,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  discountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  // Floating combo thumbnails
  comboThumbnailStack: {
    position: 'absolute',
    bottom: 60,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
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
  },
  comboThumbnailMore: {
    backgroundColor: colors.saffron,
    borderColor: '#FFFFFF',
  },
  comboThumbnailMoreText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },

  // Bottom dark gradient strip — white text overlay
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },

  // Bottom strip content
  bottomStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    zIndex: 5,
  },
  priceActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  priceBlock: {
    flexShrink: 0,
    minWidth: 0,
  },
  bottomRight: {
    flex: 1,
    minWidth: 0,
  },

  // Top-right unit badge (e.g. "500 g" or "1 L")
  unitBadge: {
    position: 'absolute',
    top: 7,
    left: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(8,12,20,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 10,
  },
  unitBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Product name on scrim — full width, left-aligned
  name: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 12.5,
    lineHeight: 15,
    letterSpacing: -0.1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Price row
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  originalPrice: {
    color: 'rgba(255,255,255,0.60)',
    textDecorationLine: 'line-through',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
  },
  price: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 15,
  },

  // "X% OFF" pill on the price row
  discountPill: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  discountPillText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  // Add button — saffron gradient pill with + icon
  addButton: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 56,
  },
  addLabel: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },

  // Out-of-stock pill
  unavailablePill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  unavailableText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

export default React.memo(ProductCard);
