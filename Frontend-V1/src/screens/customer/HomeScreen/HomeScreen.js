import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
  Image,
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
import { useCartStore, useSettingsStore } from '../../../stores';
import { useAuthGate } from '../../../hooks';
import { dashboardApi, settingsApi } from '../../../api';
import { normalizeCategory, normalizeProduct, normalizeSettings } from '../../../utils';
import { appLogo } from '../../../assets';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { requireAuth } = useAuthGate();
  
  // Stores
  const {
    items,
    addItem,
    addCombo,
    decrementCombo,
    getComboQuantity,
    updateQuantity,
    removeItem,
  } = useCartStore();
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const setSettings = useSettingsStore(state => state.setSettings);
  
  const [storeType, setStoreType] = useState('Packed Items');
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardSections, setDashboardSections] = useState([]);
  const currentApiStoreType = storeType === 'Fast Food' ? 'fast_food' : 'packed';
  const cartItemCount = useMemo(
    () => items.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [items]
  );
  const cartDisplayTotal = useMemo(
    () => items.reduce((total, item) => total + ((Number(item.product?.price) || 0) * (Number(item.quantity) || 0)), 0),
    [items]
  );

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  
  // Staggered entry for cards
  const staggerCatAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const staggerComboAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    let isMounted = true;
    const loadTimer = setTimeout(() => {
      Promise.allSettled([
        dashboardApi.getDashboard({ storeType: currentApiStoreType }),
        settingsApi.getSettings(),
      ]).then(([dashboardResult, settingsResult]) => {
        if (!isMounted) return;

        if (dashboardResult.status === 'fulfilled') {
          const sectionsData = dashboardResult.value?.data?.sections || [];
          setDashboardSections(sectionsData);
        }

        if (settingsResult.status === 'fulfilled') {
          const nextSettings = normalizeSettings(settingsResult.value);
          setSettings(nextSettings);
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
  }, [currentApiStoreType, fadeAnim, setSettings, slideAnim, staggerCatAnims, staggerComboAnims]);

  const handleSearchPress = () => {
    navigation.navigate('ProductList', { mode: 'search' });
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('ProductList', { categoryId: category.id, categoryName: category.name });
  };

  const getQty = (productId) => {
    const item = items.find(i => i.product.id === productId);
    return item ? item.quantity : 0;
  };

  const handleAddToCart = (product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else {
        addItem(product);
      }
    });
  };

  const handleIncrement = (product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else {
        addItem(product);
      }
    });
  };

  const handleDecrement = (product) => {
    if (product.isCombo || product.is_combo || product.comboItems?.length) {
      decrementCombo(product);
      return;
    }

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


  const categoryGap = spacing.sm;
  const categoryGridWidth = windowWidth - (spacing.md * 2);
  const categoryCardWidth = Math.floor((categoryGridWidth - (categoryGap * 3)) / 4);
  const categoryImageSize = Math.max(42, categoryCardWidth - spacing.sm);

  const comboGap = spacing.sm;
  const comboGridWidth = windowWidth - (spacing.md * 2);
  const comboCardWidth = Math.floor((comboGridWidth - (comboGap * 2)) / 3);

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <View style={styles.homeHeader}>
        <View style={styles.homeHeaderMain}>
          <Image
            source={appLogo}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <TouchableOpacity
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => navigation.navigate('Notifications')}
          style={styles.headerIconButton}
        >
          <AppIcon name="notification" size={22} color={colors.textPrimary} />
          <View style={styles.notificationBadge} />
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
           
           <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
             <View style={styles.titleRow}>
               <View style={styles.headerIndicator} />
               <Text style={styles.sectionTitlePremium}>Popular Combos</Text>
             </View>
             <Text style={styles.sectionSubtitle}>Handpicked bundle deals for you</Text>
           </View>
           <View style={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
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
          {/* Store Type Toggle */}
          <View style={styles.toggleContainer}>
            <SegmentedControl
              options={['Packed Items', 'Fast Food']}
              selectedOption={storeType}
              onSelect={setStoreType}
            />
          </View>

          {/* Search Bar (Fake Input) */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.searchBar}
            onPress={handleSearchPress}
            accessibilityRole="search"
            accessibilityLabel="Search products"
          >
            <AppIcon name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <Text style={styles.searchText}>
              Search items, food, snacks...
            </Text>
          </TouchableOpacity>

          {/* Dynamic Sections */}
          {dashboardSections.map(section => {
            if (section.sectionType === 'offer_banner') {
              return (
                <View key={section.id} style={styles.section}>
                  {section.items.map((offer) => (
                    <View key={offer.id} style={styles.offerBanner}>
                      <View style={styles.offerContent}>
                        <Text style={styles.offerTitle}>
                          {offer.title || 'Special Offer'}
                        </Text>
                        <Text style={styles.offerDesc}>
                          {offer.description || 'Special discount for you'}
                        </Text>
                        <Button
                          label="Shop Offer"
                          variant="highlight"
                          size="small"
                          onPress={() => navigation.navigate('ProductList', { offerId: offer.id, offerTitle: offer.title })}
                          style={styles.offerBtn}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              );
            }

            if (section.sectionType === 'category_grid') {
              const normalizedItems = section.items.map(normalizeCategory);
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.categoryGrid}>
                    {normalizedItems.map((cat, idx) => (
                      <Animated.View 
                        key={cat.id} 
                        style={{ 
                          width: categoryCardWidth,
                          opacity: staggerCatAnims[idx] || 1,
                          transform: [{ 
                            translateY: (staggerCatAnims[idx] || new Animated.Value(1)).interpolate({
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
                          imageHeight={Math.max(54, categoryImageSize * 0.85)}
                          style={[styles.categoryCard, { width: categoryCardWidth }]}
                          onPress={() => handleCategoryPress(cat)}
                        />
                      </Animated.View>
                    ))}
                  </View>
                </View>
              );
            }

            if (section.sectionType === 'product_block' || section.sectionType === 'combo_block') {
              const isComboBlock = section.sectionType === 'combo_block';
              const normalizedItems = section.items.map(normalizeProduct);
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderTop}>
                      <View style={styles.titleRow}>
                        <View style={styles.headerIndicator} />
                        <Text style={styles.sectionTitlePremium}>{section.title}</Text>
                        {isComboBlock && (
                          <View style={styles.hotBadge}>
                            <Text style={styles.hotBadgeText}>HOT 🔥</Text>
                          </View>
                        )}
                      </View>
                      {section.showSeeAll && (
                        <TouchableOpacity 
                          style={styles.seeMoreBtn}
                          onPress={() => navigation.navigate('ProductList', { 
                            sectionSlug: section.slug, 
                            sectionTitle: section.title,
                            storeType: currentApiStoreType,
                          })}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.seeMoreText}>See All</Text>
                          <AppIcon name="chevronRight" size={10} color={colors.saffronDark} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.comboGrid}>
                    {normalizedItems.map((item, idx) => {
                      const isItemCombo = isComboBlock || item.isCombo || item.is_combo;
                      return (
                        <Animated.View 
                          key={item.id} 
                          style={{ 
                            width: comboCardWidth,
                            opacity: staggerComboAnims[idx] || 1,
                            transform: [{ 
                              translateY: (staggerComboAnims[idx] || new Animated.Value(1)).interpolate({
                                inputRange: [0, 1],
                                outputRange: [20, 0]
                              }) 
                            }]
                          }}
                        >
                          <ProductCard
                            name={item.name}
                            price={item.price}
                            originalPrice={item.originalPrice}
                            discountLabel={item.discountLabel}
                            unit={item.unit}
                            isCombo={isItemCombo}
                            comboItems={item.comboItems}
                            imageUri={item.imageUri}
                            quantity={isItemCombo ? getComboQuantity(item) : getQty(item.id)}
                            onAdd={() => handleAddToCart(item)}
                            onIncrement={() => handleIncrement(item)}
                            onDecrement={() => handleDecrement(item)}
                            disabled={!item.available}
                            compact
                            dense
                            imageHeight={70}
                          />
                        </Animated.View>
                      );
                    })}
                  </View>
                </View>
              );
            }

            return null;
          })}
        </Animated.ScrollView>
      )}

      {/* Sticky Mini Cart */}
      <StickyMiniCart
        itemCount={cartItemCount}
        totalAmount={cartDisplayTotal}
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
    paddingBottom: 130,
  },
  skeletonContainer: {
    flex: 1,
    padding: spacing.md,
  },
  homeHeader: {
    minHeight: 72,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.navBar,
  },
  homeHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  brandLogo: {
    width: 150,
    height: 60,
    marginLeft: -8,
    marginTop: -8,
    marginBottom: -8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  cartBadge: {
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
  cartBadgeText: {
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
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.bgSurface,
    height: 50,
    borderRadius: radius.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  toggleContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  offerBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.saffron,
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.saffronDark,
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
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIndicator: {
    width: 4,
    height: 18,
    backgroundColor: colors.primary,
    borderRadius: radius.xs,
  },
  sectionTitlePremium: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  hotBadge: {
    backgroundColor: 'rgba(255, 75, 75, 0.1)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: spacing.xs,
  },
  hotBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.error || '#FF4B4B',
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginLeft: 8,
  },
  skeletonCategoryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skeletonCategoryCard: {
    flex: 1,
    height: 96,
    borderRadius: radius.md,
  },
  categoryGrid: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryCard: {
    minHeight: 96,
    paddingHorizontal: spacing.xs,
  },
  comboGrid: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.saffronLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 58, 0.15)',
    gap: 4,
  },
  seeMoreText: {
    ...typography.labelSmall,
    color: colors.saffronDark,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
