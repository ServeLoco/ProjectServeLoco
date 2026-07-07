import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
  RefreshControl,
  TextInput,
  FlatList,
  Pressable,
  Keyboard,
  Platform,
  BackHandler,
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
  PressableScale,
  ReconnectingPill,
  ExitAppModal,
  ErrorState,
  VariantSheet,
} from '../../../components';
import { colors, typography, spacing, radius, layout } from '../../../theme';
import { useCartStore, useSettingsStore } from '../../../stores';
import { useAuthGate } from '../../../hooks';


import {
  dashboardApi,
  notificationsApi,
  productsApi,
  settingsApi,
  subscribeNotificationEvents,
  subscribeRealtimeLifecycle,
} from '../../../api';
import {
  asArray,
  normalizeCategory,
  normalizeImageUrl,
  normalizeProduct,
  normalizeSettings,
} from '../../../utils';
import { dashboardLogo } from '../../../assets';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { requireAuth } = useAuthGate();
  
  // Stores
  const items = useCartStore(state => state.items);
  const addItem = useCartStore(state => state.addItem);
  const addCombo = useCartStore(state => state.addCombo);
  const decrementCombo = useCartStore(state => state.decrementCombo);
  const getComboQuantity = useCartStore(state => state.getComboQuantity);
  const getProductQuantity = useCartStore(state => state.getProductQuantity);
  const updateQuantity = useCartStore(state => state.updateQuantity);
  const [variantSheetProduct, setVariantSheetProduct] = useState(null);
  const removeItem = useCartStore(state => state.removeItem);
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
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [searchDismissSignal, setSearchDismissSignal] = useState(0);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const searchBackdropRef = useRef(null);
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

  // Notification badge pulse
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
      // Returning to this screen — close any active search and release focus
      setSearchDismissSignal(prev => prev + 1);
      return () => { isActive = false; };
    }, [])
  );

  // Exit-app confirmation on hardware/gesture back. Only registered while
  // Home is the focused screen; navigating away restores normal back
  // behaviour. Returning true from the listener tells the OS "we handled
  // this press" — otherwise the activity would finish before the user
  // confirms.
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        setIsExitModalOpen(true);
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
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
    // Pre-warm expo-image's disk cache for every image that will render on the
    // home screen. Images are loaded off the main thread in the background
    // and available instantly when the <Image> mounts.
    if (!dashboardSections || dashboardSections.length === 0) return;
    const urls = [];
    for (const section of dashboardSections) {
      if (section.sectionType === 'offer_banner' && Array.isArray(section.items)) {
        for (const item of section.items) {
          const u = item.details?.imageUrl || item.details?.image_url;
          if (u) urls.push(u);
        }
      } else if ((section.sectionType === 'product_block' || section.sectionType === 'combo_block') && Array.isArray(section.items)) {
        for (const item of section.items) {
          const u = item.imageUrl || item.image_url;
          if (u) urls.push(u);
        }
      }
    }
    if (urls.length > 0) {
      // Fire-and-forget; expo-image deduplicates and handles failures silently.
      ExpoImage.prefetch(urls).catch(() => {});
    }
  }, [dashboardSections]);

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

    return () => {
      pulseLoop.stop();
    };
  }, [pulseAnim]);

  const handleSearchPress = (query) => {
    // Search across both modes (packed + fast food) so users
    // find items regardless of the currently selected segment.
    navigation.navigate('ProductList', {
      mode: 'search',
      storeType: 'all',
      initialQuery: typeof query === 'string' ? query : undefined,
    });
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
      } else if ((product.variants?.length ?? 0) > 1) {
        setVariantSheetProduct(product);
      } else {
        addItem(product, 1, product.variants?.[0] ?? null);
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


  const categoryGap = spacing.md;
  const contentWidth = windowWidth - (spacing.md * 2);
  // Horizontal-scrolling cards: ~28% of content width so the next card peeks
  // (peek effect — multiple cards visible at once).
  const categoryCardWidth = Math.floor(contentWidth * 0.28);

  const comboGap = spacing.sm;
  const comboGridWidth = windowWidth - (spacing.md * 2);
  void comboGridWidth; // kept for future layout calculations
  void comboGap;

  return (
    <AppScreen
      style={styles.container}
      bg={colors.bgApp}
      safeAreaBottom={false}
      safeAreaTop={true}
      statusBarStyle="dark-content"
      statusBarBg={colors.bgApp}
    >
      <HomeHeader
        unreadCount={unreadCount}
        pulseAnim={pulseAnim}
        onNotificationsPress={() => navigation.navigate('Notifications')}
        onCartPress={() => navigation.navigate('Cart')}
        cartItemCount={cartItemCount}
        onSearchPress={handleSearchPress}
        onProductPress={handleProductPress}
        onSearchOpenChange={setIsSearchOverlayOpen}
        dismissSignal={searchDismissSignal}
        cartItems={items}
        addItem={addItem}
        updateQuantity={updateQuantity}
        removeItem={removeItem}
        requireAuth={requireAuth}
        onOpenVariantSheet={setVariantSheetProduct}
      />

      {/* Search backdrop — dims the dashboard so the dropdown reads clearly */}
      {isSearchOverlayOpen && (
        <Pressable
          ref={searchBackdropRef}
          style={styles.searchBackdrop}
          onPress={() => setSearchDismissSignal(prev => prev + 1)}
          accessibilityLabel="Dismiss search"
        />
      )}

      {/* Saffron ribbon separator — visible divider below the top bar so the
          dashboard content can scroll up and reveal it as a visual anchor. */}
      <View style={styles.topBarRibbon}>
        <View style={styles.topBarRibbonBar} />
      </View>

      {shopStatus === 'closed' && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>Shop is currently closed. We are not accepting orders.</Text>
        </View>
      )}

      {!isLoading && homeError && dashboardSections.length === 0 ? (
        <ErrorState
          message="Unable to load home. Tap to retry."
          onRetry={() => loadHomeData(true)}
          retryLabel="Retry"
        />
      ) : (
        <>
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

            <View style={styles.skeletonCategoryRow}>
             <LoadingSkeleton style={[styles.skeletonCategoryCard, { width: categoryCardWidth }]} />
             <LoadingSkeleton style={[styles.skeletonCategoryCard, { width: categoryCardWidth, marginLeft: spacing.md }]} />
             <LoadingSkeleton style={[styles.skeletonCategoryCard, { width: categoryCardWidth, marginLeft: spacing.md }]} />
           </View>
           
           <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
             <View style={styles.titleRow}>
               <View style={styles.headerIndicator} />
               <Text style={styles.sectionTitlePremium}>Popular Combos</Text>
             </View>
             <Text style={styles.sectionSubtitle}>Handpicked bundle deals for you</Text>
           </View>
            <View style={styles.skeletonProductRow}>
              <LoadingSkeleton style={[styles.skeletonProductCard, { width: windowWidth * 0.4 - spacing.md, height: (windowWidth * 0.4 - spacing.md) / 0.78 }]} />
              <LoadingSkeleton style={[styles.skeletonProductCard, { width: windowWidth * 0.4 - spacing.md, height: (windowWidth * 0.4 - spacing.md) / 0.78, marginLeft: spacing.md }]} />
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

          {/* Dynamic Sections */}
          {dashboardSections.map(section => {
            if (section.sectionType === 'offer_banner') {
              return (
                <OfferBannerCarousel
                  key={section.id}
                  offers={section.items}
                  bannerWidth={windowWidth - (spacing.md * 2)}
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
              // "See all" pill is shown at the end of the rail when the
              // admin has more categories than are displayed here.
              // Primary signal: API's `hasMore`. Fallback: totalItems > items.
              // Safety net: more than 2 categories in total.
              const totalCount = Number(section.totalItems) || normalizedItems.length;
              const hasMore =
                section.hasMore === true ||
                totalCount > normalizedItems.length ||
                normalizedItems.length > 2;
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.titleRow}>
                      <View style={styles.headerIndicator} />
                      <Text style={styles.sectionTitlePremium}>{section.title || 'Shop by Category'}</Text>
                    </View>
                  </View>
                  <Animated.FlatList
                    data={visibleItems}
                    keyExtractor={(item) => String(item.id)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryScrollContent}
                    style={styles.categoryScroll}
                    renderItem={({ item: cat, index: idx }) => (
                      <Animated.View
                        style={{
                          width: categoryCardWidth,
                          marginRight: idx === visibleItems.length - 1 ? categoryGap : categoryGap,
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
                          variant="hero"
                          name={cat.name}
                          count={cat.count}
                          imageUri={cat.imageUri}
                          style={{ width: categoryCardWidth }}
                          onPress={() => handleCategoryPress(cat)}
                        />
                      </Animated.View>
                    )}
                    ListFooterComponent={
                      hasMore ? (
                        <View style={styles.seeAllInRow}>
                          <SeeAllButton
                            label="See all"
                            onPress={() => navigation.navigate('Categories', { storeType: currentApiStoreType })}
                            accessibilityLabel="See all categories"
                          />
                        </View>
                      ) : null
                    }
                  />
                </View>
              );
            }

            if (section.sectionType === 'product_block' || section.sectionType === 'combo_block') {
              const isComboBlock = section.sectionType === 'combo_block';
              const normalizedItems = section.items.map(normalizeProduct);
              const visibleItems = isComboBlock ? normalizedItems.slice(0, 2) : normalizedItems;
              // Show the "See all" button when EITHER:
              //   (a) admin enabled the explicit "show_see_all" flag, OR
              //   (b) the section has more items than are shown on the dashboard
              //       (API's `hasMore` is true when totalItems > items.length).
              // This respects the admin's intent even if max_visible_items
              // happens to match the total item count.
              const showSeeAll = section.showSeeAll === true;
              const hasMore = section.hasMore === true;
              const shouldShowSeeAll = showSeeAll || hasMore;
              // Horizontal-scroll cards: ~40% of content width so the next card
              // peeks (same peek effect as the categories rail).
              const productCardWidth = Math.floor(contentWidth * 0.4);
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.titleRow}>
                      <View style={styles.headerIndicator} />
                      <Text style={styles.sectionTitlePremium}>{section.title}</Text>
                      {isComboBlock && (
                        <View style={styles.hotBadge}>
                          <Text style={styles.hotBadgeText}>HOT</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Animated.FlatList
                    data={visibleItems}
                    keyExtractor={(item) => String(item.id)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.productScrollContent}
                    style={styles.productScroll}
                    renderItem={({ item, index: idx }) => {
                      const isItemCombo = isComboBlock || item.isCombo || item.is_combo;
                      return (
                        <Animated.View
                          key={item.id}
                          style={{
                            width: productCardWidth,
                            marginRight: idx === visibleItems.length - 1 ? spacing.md : spacing.md,
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
                            quantity={isItemCombo ? getComboQuantity(item) : getProductQuantity(item.id)}
                            onAdd={() => handleAddToCart(item)}
                            onIncrement={() => handleIncrement(item)}
                            onDecrement={() => handleDecrement(item)}
                            onPress={() => handleProductPress(item)}
                            disabled={!item.available}
                            compact
                          />
                        </Animated.View>
                      );
                    }}
                    ListFooterComponent={
                      shouldShowSeeAll ? (
                        <View style={styles.seeAllInRowProduct}>
                          <SeeAllButton
                            label="See all"
                            onPress={() => navigation.navigate('ProductList', {
                              sectionSlug: section.slug,
                              sectionTitle: section.title,
                              storeType: currentApiStoreType,
                            })}
                            accessibilityLabel={`See all ${section.title}`}
                          />
                        </View>
                      ) : null
                    }
                  />
                </View>
              );
            }

            return null;
          })}
        </Animated.ScrollView>
          )}
        </>
      )}

      {/* Sticky Mini Cart — Home has the floating tab bar, so float above it */}
      <StickyMiniCart
        itemCount={cartItemCount}
        totalAmount={cartDisplayTotal}
        onPress={handleCartPress}
        aboveTabBar
      />
      <ReconnectingPill />

      <VariantSheet
        visible={!!variantSheetProduct}
        product={variantSheetProduct}
        onClose={() => setVariantSheetProduct(null)}
      />

      <ExitAppModal
        visible={isExitModalOpen}
        cartItemCount={cartItemCount}
        onStay={() => setIsExitModalOpen(false)}
        onExit={() => {
          setIsExitModalOpen(false);
          BackHandler.exitApp();
        }}
      />
    </AppScreen>
  );
}

function HomeHeader({
  unreadCount,
  pulseAnim,
  onNotificationsPress,
  onCartPress,
  cartItemCount = 0,
  onSearchPress,
  onProductPress,
  onSearchOpenChange,
  dismissSignal,
  cartItems = [],
  addItem,
  updateQuantity,
  removeItem,
  requireAuth,
  onOpenVariantSheet,
}) {
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [1, 1.45],
    outputRange: [0.55, 0],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);
  const dropdownAnim = useRef(new Animated.Value(0)).current;

  // Track the keyboard so we can shrink the result list while typing
  // (2 items) and let it expand to the full 6 once the keyboard hides.
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const runSearch = useCallback(async (query) => {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const response = await productsApi.getProducts({
        search: trimmed,
        q: trimmed,
        limit: 6,
      });
      const items = asArray(response, ['products']).map(normalizeProduct);
      setSearchResults(items);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, runSearch]);

  useEffect(() => {
    Animated.timing(dropdownAnim, {
      toValue: isSearchOpen ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSearchOpen, dropdownAnim]);

  useEffect(() => {
    if (onSearchOpenChange) onSearchOpenChange(isSearchOpen && hasQuery);
  }, [isSearchOpen, hasQuery, onSearchOpenChange]);

  // External dismiss signal (e.g. backdrop tap in the parent)
  useEffect(() => {
    if (dismissSignal > 0) {
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
      Keyboard.dismiss();
    }
  }, [dismissSignal]);

  const handleFocus = () => setIsSearchOpen(true);

  const focusInput = useCallback(() => {
    // If the input is already focused but the keyboard is hidden,
    // calling .focus() again is a no-op. Blur first, then re-focus
    // on the next frame so the keyboard reliably reopens.
    setTimeout(() => {
      if (searchInputRef.current?.isFocused()) {
        searchInputRef.current?.blur();
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 40);
      } else {
        searchInputRef.current?.focus();
      }
    }, 30);
  }, []);

  // If the user dismisses the keyboard via the system back button
  // or gesture, blur the input so the cursor stops blinking.
  // NOTE: do NOT close the dropdown here — the user may still want to
  // browse the results. The list only closes when they clear the text
  // (X button), tap a result, tap the backdrop, or tap "View all".
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      searchInputRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

  const handleSubmit = () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    onSearchPress(q);
  };

  const handleClear = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const getProductQuantity = (productId) => {
    // Sum across all variants of this product (a multi-variant product can
    // have several separate cart lines — e.g. 2x Veg + 1x Chicken).
    return cartItems
      .filter((item) => String(item.product.id) === String(productId) && item.type !== 'combo')
      .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  };

  const handleBuyPress = (product) => {
    if (!addItem) return;
    const doAdd = () => {
      if ((product.variants?.length ?? 0) > 1) {
        if (onOpenVariantSheet) onOpenVariantSheet(product);
        return;
      }
      addItem(product, 1, product.variants?.[0] ?? null);
    };
    if (requireAuth) {
      requireAuth(null, doAdd);
    } else {
      doAdd();
    }
  };

  const handleIncrement = (product) => {
    if (!updateQuantity) return;
    const current = getProductQuantity(product.id);
    updateQuantity(product.id, current + 1, 'product');
  };

  const handleDecrement = (product) => {
    if (!updateQuantity) return;
    const current = getProductQuantity(product.id);
    if (current <= 1 && removeItem) {
      removeItem(product.id, 'product');
    } else {
      updateQuantity(product.id, current - 1, 'product');
    }
  };

  const handleResultPress = (product) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    if (onProductPress) onProductPress(product);
  };

  const handleViewAll = () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    onSearchPress(q);
  };

  const handleCloseDropdown = () => {
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <View style={styles.homeHeader}>
      <View style={styles.homeHeaderCard}>
        <View style={styles.homeHeaderInner}>
          {/* Row 1 — brand on left, notifications on right */}
          <View style={styles.homeHeaderTopRow}>
            <View style={styles.brandChipCompact}>
              <ExpoImage
                source={dashboardLogo}
                style={styles.brandLogo}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            </View>

            {/* Right Column: Actions (Notification + Cart) */}
            <View style={styles.headerRightCol}>
              <TouchableOpacity
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                onPress={onNotificationsPress}
                style={styles.headerIconButton}
              >
                <AppIcon name="notification" size={17} color={colors.saffronDark} />
                {unreadCount > 0 && (
                  <>
                    <Animated.View
                      style={[
                        styles.headerBadgePulse,
                        {
                          transform: [{ scale: pulseAnim }],
                          opacity: pulseOpacity,
                        },
                      ]}
                    />
                    <View style={styles.headerBadge}>
                      <Text style={styles.headerBadgeText}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Cart"
                onPress={onCartPress}
                style={styles.headerIconButton}
              >
                <AppIcon name="cart" size={17} color={colors.saffronDark} />
                {cartItemCount > 0 && (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>
                      {cartItemCount > 9 ? '9+' : cartItemCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Search bar — full-width, real TextInput with live results */}
      <View style={styles.searchBarOuter}>
        <LinearGradient
          colors={['rgba(255,255,255,0.95)', 'rgba(255,242,235,0.92)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.searchBarGradient}
        >
          <Pressable
            style={styles.searchBar}
            onPressIn={focusInput}
            android_disableSound
            accessibilityLabel="Search products"
          >
            <LinearGradient
              colors={[colors.saffron, colors.saffronDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchIconBubble}
            >
              <AppIcon name="search" size={20} color="#FFFFFF" strokeWidth={2.4} />
            </LinearGradient>
            <View style={styles.searchTextWrap}>
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={handleFocus}
                onSubmitEditing={handleSubmit}
                placeholder="Search items, food, snacks..."
                placeholderTextColor={colors.textSecondary}
                selectionColor={colors.saffronDark}
                cursorColor={colors.saffronDark}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Search products"
                showSoftInputOnFocus
              />
              {!hasQuery && (
                <Text pointerEvents="none" style={styles.searchHint} numberOfLines={1}>
                  Try "samosa" or "cold drinks"
                </Text>
              )}
              {hasQuery && (
                <Text pointerEvents="none" style={styles.searchHint} numberOfLines={1}>
                  {isSearching
                    ? 'Searching...'
                    : searchResults.length > 0
                    ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'} found`
                    : 'No matches yet'}
                </Text>
              )}
            </View>
            {hasQuery ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleClear}
                style={styles.searchClearButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <AppIcon name="close" size={18} color={colors.saffronDark} strokeWidth={2.4} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSubmit}
                style={styles.searchGoPill}
                accessibilityRole="button"
                accessibilityLabel="Search"
                hitSlop={8}
              >
                <LinearGradient
                  colors={[colors.saffron, colors.saffronDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.searchGoGradient}
                >
                  <AppIcon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.8} />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </Pressable>
        </LinearGradient>
      </View>

      {/* Live search dropdown — rendered inline below the search bar */}
      {isSearchOpen && hasQuery && (
        <View style={styles.searchDropdown}>
          <View style={styles.searchDropdownHeader}>
            <Text style={styles.searchDropdownTitle} numberOfLines={1}>
              {isSearching
                ? 'Searching...'
                : searchResults.length > 0
                ? `Results for "${searchQuery.trim()}"`
                : `No matches for "${searchQuery.trim()}"`}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCloseDropdown}
              style={styles.searchDropdownClose}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <AppIcon name="close" size={16} color={colors.textSecondary} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          {searchResults.length > 0 && (
            <FlatList
              data={keyboardVisible ? searchResults.slice(0, 2) : searchResults}
              keyExtractor={(item, idx) => `sr-${item.id || idx}`}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={[
                styles.searchResultList,
                keyboardVisible && styles.searchResultListCompact,
              ]}
              contentContainerStyle={styles.searchResultListContent}
              ItemSeparatorComponent={() => <View style={styles.searchDropdownDivider} />}
              renderItem={({ item }) => {
                const qty = getProductQuantity(item.id);
                const isMultiVariant = (item.variants?.length ?? 0) > 1;
                return (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.searchResultRow}
                    onPress={() => handleResultPress(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.name}`}
                  >
                    <View style={styles.searchResultImageWrap}>
                      {item.imageUrl ? (
                        <ExpoImage
                          source={{ uri: item.imageUrl }}
                          style={styles.searchResultImage}
                          contentFit="cover"
                          transition={120}
                          priority="low"
                        />
                      ) : (
                        <View style={[styles.searchResultImage, styles.searchResultImageFallback]}>
                          <AppIcon name="box" size={20} color={colors.textTertiary || '#9AA1AB'} />
                        </View>
                      )}
                    </View>
                    <View style={styles.searchResultInfo}>
                      <Text style={styles.searchResultName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.searchResultMetaRow}>
                        <Text style={styles.searchResultPriceText} numberOfLines={1}>
                          {formatRupee(item.price)}
                        </Text>
                        {item.unit ? (
                          <Text style={styles.searchResultUnit} numberOfLines={1}>
                            · {item.unit}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {qty > 0 && isMultiVariant ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleBuyPress(item);
                        }}
                        style={styles.searchResultBuyBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`${qty} in cart. Tap to change ${item.name} options`}
                        hitSlop={6}
                      >
                        <LinearGradient
                          colors={[colors.saffron, colors.saffronDark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.searchResultBuyGradient}
                        >
                          <Text style={styles.searchResultBuyText}>{qty} in cart</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    ) : qty > 0 ? (
                      <View style={styles.searchResultStepper}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleDecrement(item);
                          }}
                          style={styles.searchResultStepBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease quantity"
                          hitSlop={6}
                        >
                          <AppIcon name="minus" size={14} color="#FFFFFF" strokeWidth={2.6} />
                        </TouchableOpacity>
                        <Text style={styles.searchResultStepQty}>{qty}</Text>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleIncrement(item);
                          }}
                          style={styles.searchResultStepBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Increase quantity"
                          hitSlop={6}
                        >
                          <AppIcon name="add" size={14} color="#FFFFFF" strokeWidth={2.6} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          handleBuyPress(item);
                        }}
                        style={styles.searchResultBuyBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Buy ${item.name}`}
                        hitSlop={6}
                      >
                        <LinearGradient
                          colors={[colors.saffron, colors.saffronDark]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.searchResultBuyGradient}
                        >
                          <Text style={styles.searchResultBuyText}>Buy</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
          {searchResults.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleViewAll}
              accessibilityRole="button"
              accessibilityLabel="View all search results"
            >
              <LinearGradient
                colors={[colors.saffron, colors.saffronDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.searchViewAll}
              >
                <Text style={styles.searchViewAllText}>View all results</Text>
                <AppIcon name="chevronRight" size={15} color="#FFFFFF" strokeWidth={2.6} />
              </LinearGradient>
            </TouchableOpacity>
          )}
          {!isSearching && searchResults.length === 0 && (
            <View style={styles.searchEmptyState}>
              <View style={styles.searchEmptyIcon}>
                <AppIcon name="search" size={22} color={colors.saffronDark} />
              </View>
              <Text style={styles.searchEmptyTitle}>No matching items</Text>
              <Text style={styles.searchEmptyHint}>
                Try different keywords or browse categories below.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function formatRupee(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${Math.round(n)}`;
}

function OfferBannerCarousel({ offers = [], bannerWidth, onOfferPress }) {
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.18)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState({});
  const isUserScrolling = useRef(false);

  const visibleOffers = offers.filter(offer => {
    const imageUri = normalizeImageUrl(offer?.imageUrl || offer?.image_url || offer?.imageUri);
    return Boolean(imageUri);
  });

  // Shimmer sweep across the banner — paused while user is interacting
  useEffect(() => {
    if (isUserScrolling.current) return undefined;
    const animation = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [sweepAnim]);

  // Soft pulsing saffron glow under the banner
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.32,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.18,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [glowAnim]);

  // Auto-advance every 4.5s, pause briefly when user takes over
  useEffect(() => {
    if (visibleOffers.length <= 1) return undefined;
    const interval = setInterval(() => {
      if (isUserScrolling.current) return;
      setActiveIndex(currentIndex => {
        const nextIndex = (currentIndex + 1) % visibleOffers.length;
        listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        return nextIndex;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [visibleOffers.length]);

  useEffect(() => {
    if (activeIndex >= visibleOffers.length) {
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [activeIndex, visibleOffers.length]);

  if (visibleOffers.length === 0) return null;

  // 8:16 ratio (1:2) — shorter, more compact banner
  const bannerHeight = Math.round((bannerWidth * 8) / 16);

  const handleMomentumEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / bannerWidth);
    setActiveIndex(Math.max(0, Math.min(nextIndex, visibleOffers.length - 1)));
    isUserScrolling.current = false;
  };

  const handleScrollBegin = () => {
    isUserScrolling.current = true;
  };

  const handleTap = (offer) => {
    // Press feedback
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
    onOfferPress?.(offer);
  };

  const sweepTranslateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-bannerWidth * 1.4, bannerWidth * 1.4],
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
        snapToInterval={bannerWidth}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={handleScrollBegin}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: bannerWidth,
          offset: bannerWidth * index,
          index,
        })}
        style={{ width: bannerWidth }}
        renderItem={({ item: offer }) => {
          const imageUri = normalizeImageUrl(offer.imageUrl || offer.image_url || offer.imageUri);
          const offerKey = String(offer.id || imageUri);
          const isClickable = offer.isClickable || offer.is_clickable;
          const hasImageError = Boolean(imageErrors[offerKey]);

          const inner = (
            <Animated.View
              style={[
                styles.offerBanner,
                {
                  width: bannerWidth,
                  height: bannerHeight,
                  opacity: fadeAnim,
                },
              ]}
            >
              {/* Shimmer sweep across the banner */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.offerBannerSweep,
                  {
                    transform: [
                      { translateX: sweepTranslateX },
                      { rotate: '-18deg' },
                    ],
                  },
                ]}
              />

              {hasImageError ? (
                <View style={[styles.offerBannerFallback, { height: bannerHeight }]}>
                  <Text style={styles.offerBannerFallbackText}>Banner image unavailable</Text>
                </View>
              ) : (
                <ExpoImage
                  source={{ uri: imageUri }}
                  style={styles.offerBannerImage}
                  contentFit="cover"
                  transition={200}
                  priority="high"
                  onError={() => setImageErrors(prev => ({ ...prev, [offerKey]: true }))}
                />
              )}

              {/* Subtle bottom gradient for any future text overlay */}
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
                start={{ x: 0, y: 0.55 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
            </Animated.View>
          );

          return (
            <View style={{ width: bannerWidth }}>
              {isClickable ? (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => handleTap(offer)}
                  accessibilityRole="button"
                  accessibilityLabel={offer.title || 'Offer banner'}
                >
                  {inner}
                </TouchableOpacity>
              ) : (
                inner
              )}
            </View>
          );
        }}
      />

      {visibleOffers.length > 1 && (
        <View style={styles.offerDots}>
          {visibleOffers.map((offer, index) => {
            const inputRange = [
              (index - 1) * bannerWidth,
              index * bannerWidth,
              (index + 1) * bannerWidth,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [6, 22, 6],
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

function SeeAllButton({ label = 'See all', onPress, accessibilityLabel }) {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const chevronAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Idle: chevron nudges back and forth to invite a tap
    const idle = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(chevronAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    idle.start();
    return () => idle.stop();
  }, [chevronAnim]);

  const handleIn = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
    Animated.spring(chevronAnim, {
      toValue: 2,
      friction: 5,
      tension: 180,
      useNativeDriver: true,
    }).start();
  };
  const handleOut = () => {
    Animated.spring(pressAnim, {
      toValue: 0,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
    Animated.spring(chevronAnim, {
      toValue: 0,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
  };

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={styles.seeAllBtn}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      <Text style={styles.seeAllText} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View
        style={[
          styles.seeAllChevronWrap,
          {
            transform: [
              {
                translateX: chevronAnim.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: [0, 3, 6],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.seeAllChevron}>
          <AppIcon name="chevronRight" size={11} color={colors.saffronDark} strokeWidth={2.6} />
        </View>
      </Animated.View>
    </PressableScale>
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
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgApp,
    zIndex: 20,
  },
  homeHeaderCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  // Saffron ribbon separator below the top bar — the dashboard ScrollView
  // starts here and scrolls up under it. Acts as a visual anchor.
  topBarRibbon: {
    height: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginTop: 6,
  },
  topBarRibbonBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.saffron,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 1,
  },
  homeHeaderInner: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  homeHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandChipCompact: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 130,
    height: 38,
  },

  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: 'auto',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.saffronLight,
    borderWidth: 1,
    borderColor: 'rgba(224, 90, 26, 0.22)',
    position: 'relative',
  },

  headerBadgePulse: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.saffron,
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.saffron,
    borderWidth: 2,
    borderColor: colors.bgSurface,
  },
  headerBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
  searchBarOuter: {
    marginTop: spacing.sm,
    marginHorizontal: 0, // full width — escapes the card padding
    borderRadius: 28,
    overflow: 'visible',
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  searchBarGradient: {
    borderRadius: 28,
    padding: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 122, 58, 0.35)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    height: 58,
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingRight: 6,
  },
  searchIconBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  searchTextWrap: {
    flex: 1,
    paddingVertical: 4,
  },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14.5,
    fontWeight: '600',
    marginBottom: 1,
    padding: 0,
  },
  searchHint: {
    ...typography.caption,
    color: colors.textTertiary || colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  searchGoPill: {
    borderRadius: 20,
    overflow: 'hidden',
    marginLeft: spacing.xs,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  searchGoGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 44,
    borderRadius: 20,
  },
  searchClearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
    backgroundColor: colors.saffronLight,
  },
  searchBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 12, 20, 0.45)',
    zIndex: 5,
  },
  searchDropdown: {
    backgroundColor: colors.bgSurface,
    marginHorizontal: spacing.sm, // wider than the search bar pill
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
  },
  searchDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchDropdownTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    flex: 1,
    textTransform: 'uppercase',
  },
  searchDropdownClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4, // tighter bottom so the ribbon sits closer to the last item
    gap: spacing.sm,
  },
  searchResultImageWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  searchResultImage: {
    width: '100%',
    height: '100%',
  },
  searchResultImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultInfo: {
    flex: 1,
    minWidth: 0,
  },
  searchResultName: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  searchResultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchResultPriceText: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '800',
    color: colors.saffronDark,
  },
  searchResultUnit: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  searchResultBuyBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 2,
  },
  searchResultBuyGradient: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultBuyText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  searchResultStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.saffronDark,
    borderRadius: 16,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 6,
  },
  searchResultStepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultStepQty: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 14,
    textAlign: 'center',
  },
  searchDropdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 46 + spacing.sm,
  },
  searchResultList: {
    // Height when the keyboard is hidden — sized to fit all 6 items
    // (each ~65px) with no extra space below the last item. The
    // "View all results" ribbon sits flush against the last item.
    height: 390,
  },
  searchResultListCompact: {
    // Height when the keyboard is up — only 2 items render, so the
    // list shrinks to match. No empty space below the 2nd item.
    height: 130,
  },
  searchResultListContent: {
    paddingBottom: 0, // ribbon sits flush against the last item
    flexGrow: 1,
  },
  searchViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm + 4,
    // Match the dropdown's bottom corners so the ribbon hugs the
    // rounded edge instead of looking like a square strip.
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  searchViewAllText: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  searchEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  searchEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  searchEmptyTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  searchEmptyHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
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
  toggleContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  offerCarouselSection: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  offerBanner: {
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  offerBannerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  offerBannerSweep: {
    position: 'absolute',
    top: -80,
    bottom: -80,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 6,
  },
  offerBannerAccent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.saffron,
  },
  offerBannerFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  offerBannerFallbackText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  offerDots: {
    marginTop: spacing.sm,
    minHeight: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  offerDot: {
    height: 6,
    borderRadius: 3,
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
  skeletonCategoryRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
  },
  skeletonCategoryCard: {
    aspectRatio: 0.9,
    borderRadius: radius.lg,
  },
  categoryScroll: {
    // FlatList in horizontal mode
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.md,
    paddingRight: spacing.md + spacing.lg, // extra right padding so last card has breathing room
    alignItems: 'center',
  },
  seeAllInRow: {
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  seeAllInRowProduct: {
    justifyContent: 'center',
    paddingLeft: spacing.md,
    alignSelf: 'center',
  },
  seeAllEndRow: {
    alignItems: 'flex-end',
    paddingTop: spacing.md,
  },
  productScroll: {
    // FlatList in horizontal mode
  },
  productScrollContent: {
    paddingHorizontal: spacing.md,
    paddingRight: spacing.md + spacing.lg, // extra right padding so the See all pill has breathing room
    alignItems: 'center',
  },
  skeletonProductRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
  },
  comboGrid: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  comboGridFeatured: {
    alignItems: 'stretch',
  },
  skeletonComboGrid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  skeletonProductCard: {
    borderRadius: radius.lg,
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.saffron,
    shadowColor: colors.saffronDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.bgSurface,
    letterSpacing: 0.3,
  },
  seeAllChevronWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  seeAllChevron: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
  },
});
