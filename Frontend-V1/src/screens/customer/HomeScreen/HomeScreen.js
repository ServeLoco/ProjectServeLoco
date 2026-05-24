import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppIcon,
  SegmentedControl,
  CategoryCard,
  ProductCard,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
  SkeletonRow,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useAuthStore, useCartStore, useSettingsStore } from '../../../stores';
import { useAuthGate } from '../../../hooks';
import { offersApi, productsApi, settingsApi } from '../../../api';
import { asArray, normalizeCategory, normalizeProduct, normalizeSettings } from '../../../utils';

function getShortAddress(profile) {
  const address = profile?.address || profile?.deliveryAddress || profile?.defaultAddress;

  if (!address) {
    return 'Set delivery location';
  }

  if (typeof address === 'string') {
    const [firstLine] = address.split(',');
    return firstLine?.trim() || 'Set delivery location';
  }

  return [
    address.area,
    address.city,
    address.pincode,
  ].filter(Boolean).join(', ') || 'Set delivery location';
}

const FAST_FOOD_CATEGORIES = new Set(['Fast Food', 'Desserts']);
const PACKED_ITEM_CATEGORIES = new Set(['Cold Drinks', 'Snacks', 'Groceries', 'Daily Essentials']);

function matchesStoreType(item, storeType) {
  const type = String(item.type || item.category_type || '').toLowerCase();
  if (type) {
    return storeType === 'Fast Food' ? type === 'fast_food' : type === 'packed';
  }

  const category = item.category || item.name;

  if (storeType === 'Fast Food') {
    return FAST_FOOD_CATEGORIES.has(category);
  }

  return PACKED_ITEM_CATEGORIES.has(category) || !FAST_FOOD_CATEGORIES.has(category);
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { requireAuth } = useAuthGate();
  const profile = useAuthStore(state => state.profile);
  
  // Stores
  const { items, totalItems, displayTotal, addItem, updateQuantity, removeItem } = useCartStore();
  const activeOffer = useSettingsStore(state => state.activeOffer);
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const setSettings = useSettingsStore(state => state.setSettings);
  
  const [storeType, setStoreType] = useState('Packed Items');
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const cartBadgeScale = useRef(new Animated.Value(1)).current;
  
  // Staggered entry for cards
  const staggerCatAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const staggerComboAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    let isMounted = true;
    const apiStoreType = storeType === 'Fast Food' ? 'fast_food' : 'packed';
    const loadTimer = setTimeout(() => {
      Promise.allSettled([
        productsApi.getCategories({ type: apiStoreType, storeType }),
        productsApi.getProducts({ featured: true, limit: 8, type: apiStoreType, storeType }),
        settingsApi.getSettings(),
        offersApi.getActiveOffer(),
      ]).then(([categoriesResult, productsResult, settingsResult, offerResult]) => {
        if (!isMounted) return;

        if (categoriesResult.status === 'fulfilled') {
          setCategories(asArray(categoriesResult.value, ['categories'])
            .map(normalizeCategory)
            .filter(category => matchesStoreType(category, storeType)));
        }

        if (productsResult.status === 'fulfilled') {
          setFeaturedProducts(asArray(productsResult.value, ['products'])
            .map(normalizeProduct)
            .filter(product => matchesStoreType(product, storeType)));
        }

        if (settingsResult.status === 'fulfilled') {
          const nextSettings = normalizeSettings(settingsResult.value);
          const offer = offerResult.status === 'fulfilled'
            ? offerResult.value?.offer || offerResult.value?.data || offerResult.value
            : nextSettings.activeOffer;
          setSettings({ ...nextSettings, activeOffer: offer });
        }

        setIsLoading(false);

        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),

          Animated.stagger(100, staggerCatAnims.map(anim =>
            Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 })
          )),

          Animated.stagger(150, staggerComboAnims.map(anim =>
            Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 })
          )),
        ]).start();
      }).catch(() => {
        if (isMounted) setIsLoading(false);
      });
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(loadTimer);
    };
  }, [fadeAnim, setSettings, slideAnim, staggerCatAnims, staggerComboAnims, storeType]);

  useEffect(() => {
    if (totalItems > 0) {
      cartBadgeScale.setValue(1.25);
      Animated.spring(cartBadgeScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }).start();
    }
  }, [cartBadgeScale, totalItems]);

  const handleSearchPress = () => {
    navigation.navigate('ProductList', { mode: 'search' });
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('ProductList', { categoryId: category.id, categoryName: category.name });
  };

  const handleShopOffer = () => {
    navigation.navigate('ProductList', { offerId: 'active_offer' });
  };

  const getQty = (productId) => {
    const item = items.find(i => i.product.id === productId);
    return item ? item.quantity : 0;
  };

  const handleAddToCart = (product) => {
    requireAuth(null, () => addItem(product));
  };

  const handleIncrement = (product) => {
    requireAuth(null, () => addItem(product));
  };

  const handleDecrement = (product) => {
    const currentQty = getQty(product.id);
    if (currentQty <= 1) {
      removeItem(product.id);
    } else {
      updateQuantity(product.id, currentQty - 1);
    }
  };

  const handleCartPress = () => {
    navigation.navigate('Cart');
  };

  const handleLocationPress = () => {
    requireAuth('EditProfile');
  };

  const shortAddress = getShortAddress(profile);
  const categoryGap = spacing.sm;
  const categoryGridWidth = windowWidth - (spacing.lg * 2);
  const categoryCardWidth = Math.floor((categoryGridWidth - (categoryGap * 3)) / 4);
  const categoryImageSize = Math.max(42, categoryCardWidth - spacing.sm);

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <View style={styles.homeHeader}>
        <View style={styles.homeHeaderMain}>
          <Text style={styles.brandTitle}>ServeLoco</Text>
          <TouchableOpacity
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Select delivery location"
            onPress={handleLocationPress}
            style={styles.locationButton}
          >
            <Text style={styles.locationLabel} numberOfLines={1}>
              {shortAddress}
            </Text>
            <AppIcon name="down" size={14} color={colors.textSecondary} style={styles.locationChevron} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Cart"
          onPress={handleCartPress}
          style={styles.headerCartButton}
        >
          <AppIcon name="cart" size={22} color={colors.textPrimary} />
          {totalItems > 0 && (
            <Animated.View style={[styles.headerCartBadge, { transform: [{ scale: cartBadgeScale }] }]}>
              <Text style={styles.headerCartBadgeText}>
                {totalItems > 99 ? '99+' : String(totalItems)}
              </Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      </View>
      
      {shopStatus === 'closed' && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>Shop is currently closed. We are not accepting orders.</Text>
        </View>
      )}

      {isLoading ? (
        <ScrollView style={styles.skeletonContainer}>
           <LoadingSkeleton style={{ height: 48, borderRadius: radius.md, marginBottom: spacing.lg }} />
           <LoadingSkeleton style={{ height: 120, borderRadius: radius.lg, marginBottom: spacing.xl }} />
           
            <View style={styles.skeletonCategoryGrid}>
             <LoadingSkeleton style={styles.skeletonCategoryCard} />
             <LoadingSkeleton style={styles.skeletonCategoryCard} />
             <LoadingSkeleton style={styles.skeletonCategoryCard} />
             <LoadingSkeleton style={styles.skeletonCategoryCard} />
           </View>
           
           <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Popular Combos</Text>
           <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
             <SkeletonRow />
             <SkeletonRow />
           </View>
        </ScrollView>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* Search Bar (Fake Input) */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.searchBar}
            onPress={handleSearchPress}
          >
            <Text style={styles.searchText}>
              Search items, food, snacks...
            </Text>
          </TouchableOpacity>

          {/* Store Type Toggle */}
          <View style={styles.toggleContainer}>
            <SegmentedControl
              options={['Packed Items', 'Fast Food']}
              selectedOption={storeType}
              onSelect={setStoreType}
            />
          </View>

          {/* Offer Banner */}
          <View style={styles.offerBanner}>
            <View style={styles.offerContent}>
              <Text style={styles.offerTitle}>
                {activeOffer?.title || 'Special Offer'}
              </Text>
              <Text style={styles.offerDesc}>
                {activeOffer?.description || 'Flat 30% off on snacks & combos'}
              </Text>
              <Button
                label="Shop Offer"
                size="small"
                onPress={handleShopOffer}
                style={styles.offerBtn}
              />
            </View>
          </View>

          {/* Categories (Horizontal) */}
          <View style={styles.section}>
            <View style={styles.categoryGrid}>
              {categories.map((cat, idx) => (
                <Animated.View 
                  key={cat.id} 
                  style={{ 
                    width: categoryCardWidth,
                    opacity: staggerCatAnims[idx],
                    transform: [{ 
                      translateY: staggerCatAnims[idx].interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0]
                      }) 
                    }]
                  }}
                >
                  <CategoryCard
                    name={cat.name}
                    count={cat.count}
                    imageUri={cat.imageUri}
                    imageWidth={categoryImageSize}
                    imageHeight={Math.max(38, categoryImageSize * 0.66)}
                    style={[styles.categoryCard, { width: categoryCardWidth }]}
                    onPress={() => handleCategoryPress(cat)}
                  />
                </Animated.View>
              ))}
            </View>
          </View>

          {/* Combo Deals (Vertical List of Cards) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular Combos</Text>
            <View style={styles.comboList}>
              {featuredProducts.map((combo, idx) => (
                <Animated.View 
                  key={combo.id} 
                  style={[
                    styles.comboWrap,
                    {
                      opacity: staggerComboAnims[idx],
                      transform: [{ 
                        translateX: staggerComboAnims[idx].interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0]
                        }) 
                      }]
                    }
                  ]}
                >
                  <ProductCard
                    name={combo.name}
                    price={combo.price}
                    originalPrice={combo.originalPrice}
                    discountLabel={combo.discountLabel}
                    unit={combo.unit}
                    imageUri={combo.imageUri}
                    quantity={getQty(combo.id)}
                    onAdd={() => handleAddToCart(combo)}
                    onIncrement={() => handleIncrement(combo)}
                    onDecrement={() => handleDecrement(combo)}
                    disabled={!combo.available}
                  />
                </Animated.View>
              ))}
            </View>
          </View>
        </Animated.ScrollView>
      )}

      {/* Sticky Mini Cart */}
      <StickyMiniCart
        itemCount={totalItems}
        totalAmount={displayTotal}
        onPress={handleCartPress}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl * 2,
  },
  skeletonContainer: {
    flex: 1,
    padding: spacing.lg,
  },
  homeHeader: {
    minHeight: 72,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    ...shadows.navBar,
  },
  homeHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  locationButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 28,
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  locationLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  locationChevron: {
    marginLeft: spacing.xs,
  },
  headerCartButton: {
    minWidth: 52,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerCartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeBg,
    borderWidth: 1.5,
    borderColor: colors.bgSurface,
  },
  headerCartBadgeText: {
    ...typography.caption,
    color: colors.badgeText,
    fontSize: 10,
    fontWeight: '700',
  },
  closedBanner: {
    backgroundColor: colors.error,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  searchBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.bgSurface,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
    elevation: 2,
  },
  searchText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  toggleContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  offerBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  offerContent: {
    zIndex: 1,
  },
  offerTitle: {
    ...typography.h3,
    color: colors.textInverse,
    marginBottom: 4,
  },
  offerDesc: {
    ...typography.body,
    color: colors.textInverse,
    opacity: 0.9,
    marginBottom: spacing.md,
  },
  offerBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSurface,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  skeletonCategoryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  skeletonCategoryCard: {
    flex: 1,
    height: 96,
    borderRadius: radius.md,
  },
  categoryGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryCard: {
    minHeight: 96,
    paddingHorizontal: spacing.xs,
  },
  comboList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  comboWrap: {
    marginBottom: spacing.sm,
  },
});
