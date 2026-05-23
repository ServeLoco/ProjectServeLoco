import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  ProductCard,
  QuantityStepper,
  Button,
  ProductImage,
} from '../../components';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import { useCartStore } from '../../stores';
import { useAuthGate } from '../../hooks';
import { productsApi } from '../../api';
import { asArray, normalizeProduct } from '../../utils';

export default function ProductDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { requireAuth } = useAuthGate();
  
  const productId = route.params?.id || route.params?.productId;
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Stores
  const { items, totalItems, addItem, updateQuantity, removeItem } = useCartStore();

  // Animations
  const imgFade = useRef(new Animated.Value(0)).current;
  const detailsSlide = useRef(new Animated.Value(30)).current;
  const detailsFade = useRef(new Animated.Value(0)).current;
  const bottomBarSlide = useRef(new Animated.Value(80)).current;
  const staggerRelatedAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setLoadError('');

    productsApi.getProduct(productId)
      .then(response => {
        if (!isMounted) return;
        const data = response?.product || response?.data || response;
        const normalized = normalizeProduct(data);
        setProduct(normalized);
        setRelatedProducts(
          normalized.relatedProducts.length > 0
            ? normalized.relatedProducts
            : asArray(data?.related || data?.similarProducts || data?.similar_products, ['products']).map(normalizeProduct),
        );
        setIsLoading(false);

        Animated.parallel([
          Animated.timing(imgFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(detailsFade, { toValue: 1, duration: 400, delay: 100, useNativeDriver: true }),
          Animated.timing(detailsSlide, { toValue: 0, duration: 400, delay: 100, useNativeDriver: true }),
          Animated.timing(bottomBarSlide, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }),
          Animated.stagger(150, staggerRelatedAnims.map(anim =>
            Animated.timing(anim, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true })
          )),
        ]).start();
      })
      .catch(error => {
        if (!isMounted) return;
        setLoadError(error.message || 'Failed to load product');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [bottomBarSlide, detailsFade, detailsSlide, imgFade, productId, staggerRelatedAnims]);

  const getQty = (id) => {
    const item = items.find(i => i.product.id === id);
    return item ? item.quantity : 0;
  };

  const handleAddToCart = (item) => requireAuth(null, () => addItem(item));
  const handleIncrement = (item) => requireAuth(null, () => addItem(item));
  const handleDecrement = (item) => {
    const currentQty = getQty(item.id);
    if (currentQty <= 1) removeItem(item.id);
    else updateQuantity(item.id, currentQty - 1);
  };

  if (isLoading) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Product" onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Text style={styles.centerText}>Loading product...</Text>
        </View>
      </AppScreen>
    );
  }

  if (loadError || !product) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Product" onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Text style={styles.centerText}>{loadError || 'Product not found'}</Text>
          <Button label="Back to Products" onPress={() => navigation.goBack()} fullWidth={false} />
        </View>
      </AppScreen>
    );
  }

  const currentQty = getQty(product.id);

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      {/* Header */}
      <AppHeader
        title={product.name}
        onBack={() => navigation.goBack()}
        cartCount={totalItems}
        onCartPress={() => navigation.navigate('Cart')}
        bg="transparent"
        bordered={false}
        style={styles.headerAbsolute}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Large Product Image */}
        <Animated.View style={[styles.imageContainer, { opacity: imgFade }]}>
          <ProductImage uri={product.imageUri} width="100%" height={300} borderRadius={0} style={styles.image} />
          
          {/* Discount Badge on Image */}
          {product.discountLabel && (
            <View style={styles.imgDiscountBadge}>
              <Text style={styles.imgDiscountText}>{product.discountLabel}</Text>
            </View>
          )}

          {!product.available && (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockText}>Out of Stock</Text>
            </View>
          )}
        </Animated.View>

        {/* Product Details */}
        <Animated.View 
          style={[
            styles.detailsContainer, 
            { opacity: detailsFade, transform: [{ translateY: detailsSlide }] }
          ]}
        >
          <View style={styles.metaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{product.category}</Text>
            </View>
            <Text style={styles.unitText}>{product.unit}</Text>
          </View>

          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>Rs. {product.price}</Text>
            {!!product.originalPrice && (
              <Text style={styles.originalPrice}>Rs. {product.originalPrice}</Text>
            )}
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Product Details</Text>
          {product.description ? (
            <Text style={styles.description}>{product.description}</Text>
          ) : (
            <View style={styles.missingDesc}>
              <Text style={styles.missingDescText}>No description available for this item.</Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* Related Products */}
          <Text style={styles.sectionTitle}>Similar Products</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relatedScroll}>
            {relatedProducts.map((rel, idx) => (
              <Animated.View
                key={rel.id}
                style={[
                  styles.relatedCardWrap,
                  {
                    opacity: staggerRelatedAnims[idx],
                    transform: [{ 
                      translateX: staggerRelatedAnims[idx].interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0]
                      }) 
                    }]
                  }
                ]}
              >
                <ProductCard
                  name={rel.name}
                  price={rel.price}
                  originalPrice={rel.originalPrice}
                  discountLabel={rel.discountLabel}
                  unit={rel.unit}
                  imageUri={rel.imageUri}
                  quantity={getQty(rel.id)}
                  onAdd={() => handleAddToCart(rel)}
                  onIncrement={() => handleIncrement(rel)}
                  onDecrement={() => handleDecrement(rel)}
                  disabled={!rel.available}
                />
              </Animated.View>
            ))}
          </ScrollView>

        </Animated.View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <Animated.View 
        style={[
          styles.bottomBar, 
          { transform: [{ translateY: bottomBarSlide }] }
        ]}
      >
        <View style={styles.bottomPriceCol}>
          <Text style={styles.bottomPriceLabel}>Total Price</Text>
          <Text style={styles.bottomPriceVal}>Rs. {product.price * (currentQty || 1)}</Text>
        </View>

        <View style={styles.bottomActionCol}>
          {currentQty === 0 ? (
            <Button 
              label="Add to Cart" 
              onPress={() => handleAddToCart(product)}
              disabled={!product.available}
              style={{ flex: 1 }}
            />
          ) : (
            <View style={styles.inCartActions}>
              <QuantityStepper
                quantity={currentQty}
                onAdd={() => handleAddToCart(product)}
                onIncrement={() => handleIncrement(product)}
                onDecrement={() => handleDecrement(product)}
                disabled={!product.available}
              />
              <Button 
                label="View Cart" 
                variant="outline" 
                onPress={() => navigation.navigate('Cart')}
                style={styles.viewCartBtn}
              />
            </View>
          )}
        </View>
      </Animated.View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  headerAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  scrollContent: {
    paddingTop: layout.headerHeight,
    paddingBottom: layout.bottomNavHeight + spacing.xxxl,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: colors.bgSurface,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centerText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  imgDiscountBadge: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  imgDiscountText: {
    ...typography.caption,
    color: colors.primaryText,
    fontWeight: '700',
  },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    ...typography.h3,
    color: colors.textInverse,
  },
  detailsContainer: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    minHeight: 500,
    ...shadows.card,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    backgroundColor: colors.bgDisabled,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  unitText: {
    ...typography.label,
    color: colors.textTertiary,
  },
  name: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  price: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  originalPrice: {
    ...typography.body,
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontWeight: '700',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  missingDesc: {
    backgroundColor: colors.bgApp,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  missingDescText: {
    ...typography.body,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  relatedScroll: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  relatedCardWrap: {
    marginRight: spacing.md,
    width: 140,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxl, // Safe area for iPhone
    alignItems: 'center',
    ...shadows.xl,
  },
  bottomPriceCol: {
    flex: 1,
  },
  bottomPriceLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  bottomPriceVal: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  bottomActionCol: {
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  inCartActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  viewCartBtn: {
    minWidth: 90,
  },
});
