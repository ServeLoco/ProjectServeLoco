import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
  Image,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
import { colors, typography, spacing, radius, shadows, layout } from '../../../theme';
import { useCartStore, useSettingsStore } from '../../../stores';
import { useAuthGate } from '../../../hooks';
import {
  dashboardApi,
  notificationsApi,
  settingsApi,
  subscribeNotificationEvents,
  subscribeRealtimeLifecycle,
} from '../../../api';
import { normalizeCategory, normalizeImageUrl, normalizeProduct, normalizeSettings } from '../../../utils';
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
  const isSettingsStale = useSettingsStore(state => state.isStale);
  const markSettingsFetched = useSettingsStore(state => state.markFetched);
  
  const [storeType, setStoreType] = useState('Fast Food');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardSections, setDashboardSections] = useState([]);
  const [homeError, setHomeError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
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
  
  // Notification animations
  const bellRotation = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const unreadRefreshTimer = useRef(null);
  
  // Staggered entry for cards
  const staggerCatAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const staggerComboAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  const loadHomeData = React.useCallback((refresh = false) => {
    let isMounted = true;
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setHomeError('');

    // Only fetch settings if stale (older than 5 min) or explicit refresh
    const settingsPromise = (refresh || isSettingsStale())
      ? settingsApi.getSettings()
      : Promise.resolve(null);

    Promise.allSettled([
      dashboardApi.getDashboard({ storeType: currentApiStoreType }),
      settingsPromise,
      notificationsApi.getUnreadCount().catch(() => 0),
    ]).then(([dashboardResult, settingsResult, notificationsResult]) => {
      if (!isMounted) return;

      if (dashboardResult.status === 'fulfilled') {
        const sectionsData = dashboardResult.value?.data?.sections || [];
        setDashboardSections(sectionsData);
      } else {
        setDashboardSections([]);
        setHomeError('Unable to load home sections. Pull to retry.');
      }

      if (settingsResult.status === 'fulfilled' && settingsResult.value !== null) {
        const nextSettings = normalizeSettings(settingsResult.value);
        setSettings(nextSettings);
        markSettingsFetched();
      }

      if (notificationsResult.status === 'fulfilled') {
        setUnreadCount(notificationsResult.value || 0);
      }

      setIsLoading(false);
      setIsRefreshing(false);

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
      if (isMounted) {
        setHomeError('Unable to load home data. Pull to retry.');
        setIsLoading(false);
        setIsRefreshing(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentApiStoreType, fadeAnim, setSettings, markSettingsFetched, isSettingsStale, slideAnim, staggerCatAnims, staggerComboAnims]);

  useEffect(() => {
    let cleanupLoad;
    const loadTimer = setTimeout(() => {
      cleanupLoad = loadHomeData(false);
    }, 0);

    return () => {
      clearTimeout(loadTimer);
      cleanupLoad?.();
    };
  }, [loadHomeData]);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      notificationsApi.getUnreadCount()
        .then(count => {
          if (isActive) setUnreadCount(count || 0);
        })
        .catch(() => {});
      return () => { isActive = false; };
    }, [])
  );

  const queueUnreadRefresh = React.useCallback(() => {
    if (unreadRefreshTimer.current) {
      clearTimeout(unreadRefreshTimer.current);
    }

    unreadRefreshTimer.current = setTimeout(() => {
      notificationsApi.getUnreadCount()
        .then(count => setUnreadCount(count || 0))
        .catch(() => {});
    }, 350);
  }, []);

  useEffect(() => {
    const unsubscribeNotifications = subscribeNotificationEvents(({ eventName, payload }) => {
      if (eventName === 'notification.unread_count.updated') {
        if (unreadRefreshTimer.current) {
          clearTimeout(unreadRefreshTimer.current);
        }
        setUnreadCount(payload?.unreadCount || 0);
        return;
      }

      if (eventName === 'notification.created') {
        queueUnreadRefresh();
      }
    });

    const unsubscribeLifecycle = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') {
        queueUnreadRefresh();
      }
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeLifecycle();
      if (unreadRefreshTimer.current) {
        clearTimeout(unreadRefreshTimer.current);
      }
    };
  }, [queueUnreadRefresh]);

  useEffect(() => {
    // 1. Badge pulse/glow loop animation (1.0 to 2.0 scale)
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 2.0,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // 2. Bell shake animation to grab user attention periodically
    const shake = Animated.sequence([
      Animated.timing(bellRotation, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(bellRotation, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]);

    // Shake immediately on load
    shake.start();

    // Loop shake every 7 seconds
    const interval = setInterval(() => {
      shake.start();
    }, 7000);

    return () => {
      pulseLoop.stop();
      clearInterval(interval);
    };
  }, [pulseAnim, bellRotation]);

  const spin = bellRotation.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-12deg', '12deg'],
  });

  const handleSearchPress = () => {
    // Search across both modes (packed + fast food) so users
    // find items regardless of the currently selected segment.
    navigation.navigate('ProductList', { mode: 'search', storeType: 'all' });
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('ProductList', { categoryId: category.id, categoryName: category.name, storeType: currentApiStoreType });
  };

  const handleProductPress = (product) => {
    const isCombo = product.isCombo || product.is_combo || product.comboItems?.length;
    navigation.navigate('ProductDetail', {
      id: product.id,
      type: isCombo ? 'combo' : 'product',
      product,
    });
  };

  const getQty = React.useCallback((productId) => {
    const item = items.find(i => i.product.id === productId && (i.type || 'product') !== 'combo');
    return item ? item.quantity : 0;
  }, [items]);

  const handleAddToCart = React.useCallback((product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else {
        addItem(product);
      }
    });
  }, [requireAuth, addCombo, addItem]);

  const handleIncrement = React.useCallback((product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else {
        addItem(product);
      }
    });
  }, [requireAuth, addCombo, addItem]);

  const handleDecrement = React.useCallback((product) => {
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
  }, [decrementCombo, getQty, removeItem, updateQuantity]);

  const handleCartPress = React.useCallback(() => {
    navigation.navigate('Cart');
  }, [navigation]);


  const categoryGap = spacing.sm;
  const categoryGridWidth = windowWidth - (spacing.md * 2);
  const categoryCardWidth = Math.floor((categoryGridWidth - (categoryGap * 3)) / 4);

  const comboGap = spacing.sm;
  const comboGridWidth = windowWidth - (spacing.md * 2);
  const productBlockCardWidth = Math.floor((comboGridWidth - (comboGap * 2)) / 3);
  const comboCardWidth = Math.floor((comboGridWidth - comboGap) / 2);

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
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => navigation.navigate('Notifications')}
          style={styles.headerIconButton}
        >
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <AppIcon name="notification" size={22} color={colors.textPrimary} />
          </Animated.View>
          {unreadCount > 0 && (
            <>
              <Animated.View 
                style={[
                  styles.notificationBadgeGlow,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 2],
                      outputRange: [0.6, 0],
                    }),
                  }
                ]} 
              />
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {shopStatus === 'closed' && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>Shop is currently closed. We are not accepting orders.</Text>
        </View>
      )}

      {!isLoading && homeError ? (
        <View style={styles.homeErrorCard}>
          <Text style={styles.homeErrorText}>{homeError}</Text>
          <Button label="Retry" size="small" variant="outline" onPress={() => loadHomeData(true)} />
        </View>
      ) : null}

      {isLoading ? (
        <ScrollView
          style={styles.skeletonContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadHomeData(true)}
              tintColor={colors.primary}
              colors={[colors.primary, colors.success, colors.saffron]}
              title="Refreshing ServeLoco"
              titleColor={colors.textSecondary}
            />
          }
        >
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
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadHomeData(true)}
              tintColor={colors.primary}
              colors={[colors.primary, colors.success, colors.saffron]}
              title="Refreshing ServeLoco"
              titleColor={colors.textSecondary}
            />
          }
        >
          {/* Store Type Toggle */}
          <View style={styles.toggleContainer}>
            <SegmentedControl
              options={['Packed Items', 'Fast Food']}
              selectedOption={storeType}
              onSelect={(val) => {
                if (val !== storeType) {
                  setDashboardSections([]);
                  setIsLoading(true);
                  setStoreType(val);
                }
              }}
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
                <OfferBannerCarousel
                  key={section.id}
                  offers={section.items}
                  windowWidth={windowWidth}
                  onOfferPress={(offer) => navigation.navigate('ProductList', {
                    offerId: offer.id,
                    offerTitle: offer.title,
                    storeType: currentApiStoreType,
                  })}
                />
              );
            }

            if (section.sectionType === 'category_grid') {
              const normalizedItems = section.items.map(normalizeCategory);
              const visibleItems = normalizedItems.slice(0, 4);
              const shouldShowSeeAll = section.showSeeAll || normalizedItems.length > visibleItems.length;
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderTop}>
                      <View style={styles.titleRow}>
                        <View style={styles.headerIndicator} />
                        <Text style={styles.sectionTitlePremium}>{section.title || 'Shop by Category'}</Text>
                      </View>
                      {shouldShowSeeAll && (
                        <TouchableOpacity
                          style={styles.seeMoreBtn}
                          onPress={() => navigation.navigate('Categories', { storeType: currentApiStoreType })}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="See all categories"
                        >
                          <Text style={styles.seeMoreText}>See All</Text>
                          <AppIcon name="chevronRight" size={10} color={colors.saffronDark} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.categoryGrid}>
                    {visibleItems.map((cat, idx) => (
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
                          imageHeight={62}
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
              const visibleItems = isComboBlock ? normalizedItems.slice(0, 2) : normalizedItems;
              const shouldShowSeeAll = section.showSeeAll || (isComboBlock && normalizedItems.length > 2);
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
                      {shouldShowSeeAll && (
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
                  <View style={[styles.comboGrid, isComboBlock && styles.comboGridFeatured]}>
                    {visibleItems.map((item, idx) => {
                      const isItemCombo = isComboBlock || item.isCombo || item.is_combo;
                      const cardWidth = isComboBlock ? comboCardWidth : productBlockCardWidth;
                      return (
                        <Animated.View 
                          key={item.id} 
                          style={{ 
                            width: cardWidth,
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
                            onPress={() => handleProductPress(item)}
                            disabled={!item.available}
                            compact
                            dense={!isComboBlock}
                            imageHeight={isComboBlock ? 82 : 70}
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

function OfferBannerCarousel({ offers = [], windowWidth, onOfferPress }) {
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState({});
  const itemWidth = windowWidth - (spacing.md * 2);
  const bannerWidth = windowWidth - (spacing.md * 2);
  const bannerHeight = Math.round(bannerWidth / 2);
  const visibleOffers = offers.filter(offer => {
    const imageUri = normalizeImageUrl(offer?.imageUrl || offer?.image_url || offer?.imageUri);
    return Boolean(imageUri);
  });

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 2600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );

    animation.start();
    return () => animation.stop();
  }, [sweepAnim]);

  useEffect(() => {
    if (visibleOffers.length <= 1) return undefined;

    const interval = setInterval(() => {
      setActiveIndex(currentIndex => {
        const nextIndex = (currentIndex + 1) % visibleOffers.length;
        listRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        return nextIndex;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [visibleOffers.length]);

  useEffect(() => {
    if (activeIndex >= visibleOffers.length) {
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [activeIndex, visibleOffers.length]);

  if (visibleOffers.length === 0) return null;

  const handleMomentumEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / itemWidth);
    setActiveIndex(Math.max(0, Math.min(nextIndex, visibleOffers.length - 1)));
  };

  const sweepTranslateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-bannerWidth * 1.35, bannerWidth * 1.35],
  });

  const glowOpacity = sweepAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.28, 0.64, 0.28],
  });

  return (
    <View style={styles.offerCarouselSection}>
      <Animated.FlatList
        ref={listRef}
        data={visibleOffers}
        keyExtractor={(offer, index) => String(offer.id || index)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: itemWidth,
          offset: itemWidth * index,
          index,
        })}
        renderItem={({ item: offer }) => {
          const imageUri = normalizeImageUrl(offer.imageUrl || offer.image_url || offer.imageUri);
          const offerKey = String(offer.id || imageUri);
          const isClickable = offer.isClickable || offer.is_clickable;
          const hasImageError = Boolean(imageErrors[offerKey]);
          const bannerImage = (
            <View style={styles.offerBannerFrame}>
              <Animated.View style={[styles.offerBannerAura, { opacity: glowOpacity }]} />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.offerBannerSweep,
                  {
                    transform: [
                      { translateX: sweepTranslateX },
                      { rotate: '-16deg' },
                    ],
                  },
                ]}
              />
              <View pointerEvents="none" style={styles.offerBannerEdge} />
              {hasImageError ? (
                <View
                  style={[
                    styles.offerBanner,
                    styles.offerBannerFallback,
                    {
                      width: '100%',
                      height: bannerHeight,
                      borderRadius: radius.lg,
                    },
                  ]}
                >
                  <Text style={styles.offerBannerFallbackText}>Banner image unavailable</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: imageUri }}
                  style={[
                    styles.offerBanner,
                    {
                      width: '100%',
                      height: bannerHeight,
                      borderRadius: radius.lg,
                    },
                  ]}
                  resizeMode="contain"
                  onError={() => setImageErrors(prev => ({ ...prev, [offerKey]: true }))}
                />
              )}
            </View>
          );

          return (
            <View style={{ width: itemWidth }}>
              {isClickable ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onOfferPress(offer)}
                  style={styles.offerBannerTouch}
                  accessibilityRole="button"
                  accessibilityLabel={offer.title || 'Offer banner'}
                >
                  {bannerImage}
                </TouchableOpacity>
              ) : (
                <View style={styles.offerBannerTouch}>
                  {bannerImage}
                </View>
              )}
            </View>
          );
        }}
      />

      {visibleOffers.length > 1 && (
        <View style={styles.offerDots}>
          {visibleOffers.map((offer, index) => {
            const inputRange = [
              (index - 1) * itemWidth,
              index * itemWidth,
              (index + 1) * itemWidth,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [7, 20, 7],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.35, 1, 0.35],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={offer.id || index}
                style={[
                  styles.offerDot,
                  {
                    width: dotWidth,
                    opacity: activeIndex === index ? 1 : opacity,
                  },
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    paddingBottom: layout.stickyCartScrollPadding,
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
    borderRadius: 22,
    backgroundColor: colors.bgSurface,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeBg || '#FF7A3A',
    borderWidth: 1.5,
    borderColor: colors.bgSurface,
  },
  notificationBadgeText: {
    ...typography.caption,
    color: colors.badgeText || '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  notificationBadgeGlow: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.badgeBg || '#FF7A3A',
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
  homeErrorCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error || '#FF4B4B',
    backgroundColor: colors.bgCard,
    gap: spacing.sm,
  },
  homeErrorText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
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
  offerCarouselSection: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  offerBannerTouch: {
    borderRadius: radius.lg,
  },
  offerBannerFrame: {
    width: '100%',
    padding: 4,
    borderRadius: radius.lg + 5,
    backgroundColor: '#071822',
    overflow: 'hidden',
    shadowColor: '#0891B2',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 9,
  },
  offerBanner: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
  },
  offerBannerAura: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#22D3EE',
  },
  offerBannerSweep: {
    position: 'absolute',
    top: -70,
    bottom: -70,
    width: 54,
    backgroundColor: 'rgba(236,254,255,0.86)',
    shadowColor: '#67E8F9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.82,
    shadowRadius: 16,
    elevation: 10,
  },
  offerBannerEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg + 5,
    borderWidth: 1,
    borderColor: 'rgba(165,243,252,0.72)',
  },
  offerBannerFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  offerBannerFallbackText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  offerDots: {
    marginTop: spacing.sm,
    minHeight: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  offerDot: {
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.saffronDark,
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
  comboGridFeatured: {
    alignItems: 'stretch',
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
