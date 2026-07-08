/* eslint-disable react-hooks/exhaustive-deps */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  TextInputField,
  ProductCard,
  AppIcon,
  StickyMiniCart,
  SkeletonRow,
  EmptyState,
  ErrorState,
  VariantSheet,
} from '../../../components';
import { colors, typography, spacing, radius, layout } from '../../../theme';
import { useCartStore } from '../../../stores';
import { useAuthGate } from '../../../hooks';
import { productsApi, dashboardApi } from '../../../api';
import { asArray, normalizeProduct } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SORT_OPTIONS = ['Popular', 'Price Low to High', 'Price High to Low'];

export default function ProductListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { requireAuth } = useAuthGate();
  
  // Params
  const mode = route.params?.mode || 'category'; // 'search' | 'category'
  const initialCategory = route.params?.categoryName || 'All';
  const offerId = route.params?.offerId || null;
  const offerTitle = route.params?.offerTitle || null;
  const sectionSlug = route.params?.sectionSlug || null;
  const sectionTitle = route.params?.sectionTitle || null;
  const sectionStoreType = route.params?.storeType || 'all';
  const initialQuery = route.params?.initialQuery || '';

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.floor((windowWidth - (spacing.lg * 2) - spacing.md) / 2);

  // Stores
  const items = useCartStore(state => state.items);
  const addItem = useCartStore(state => state.addItem);
  const addCombo = useCartStore(state => state.addCombo);
  const decrementCombo = useCartStore(state => state.decrementCombo);
  const getComboQuantity = useCartStore(state => state.getComboQuantity);
  const getProductQuantity = useCartStore(state => state.getProductQuantity);
  const updateQuantity = useCartStore(state => state.updateQuantity);
  const removeItem = useCartStore(state => state.removeItem);
  const [variantSheetProduct, setVariantSheetProduct] = useState(null);

  // State
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState('Popular');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [products, setProducts] = useState([]);
  const cartItemCount = useMemo(
    () => items.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [items]
  );
  const cartDisplayTotal = useMemo(
    () => items.reduce((total, item) => total + ((Number(item.variant?.price ?? item.product?.price) || 0) * (Number(item.quantity) || 0)), 0),
    [items]
  );

  const fetchProducts = async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setIsError(false);

    try {
      let response;
      let filtered = [];

      if (sectionSlug) {
        response = await dashboardApi.getSectionItems(sectionSlug, {
          available: showAvailableOnly ? true : undefined,
          storeType: sectionStoreType,
        });
        filtered = asArray(response, ['items']).map(normalizeProduct);
      } else {
        const isOriginalCategory = activeCategory === initialCategory;
        const queryCategoryId = isOriginalCategory ? route.params?.categoryId : undefined;

        response = await productsApi.getProducts({
          category: activeCategory !== 'All' ? activeCategory : undefined,
          categoryId: queryCategoryId,
          q: searchQuery || undefined,
          search: searchQuery || undefined,
          available: showAvailableOnly ? true : undefined,
          offerId: offerId || undefined,
          isCombo: mode === 'combos',
          featured: mode === 'combos' ? true : undefined,
          sort: sortBy,
          type: sectionStoreType !== 'all' ? sectionStoreType : undefined,
          storeType: sectionStoreType !== 'all' ? sectionStoreType : undefined,
        });
        filtered = asArray(response, ['products']).map(normalizeProduct);
        if (mode !== 'combos') {
          filtered = filtered.filter(p => !(p.isCombo || p.is_combo || p.comboItems?.length));
        }

        // Category Filter
        if (activeCategory !== 'All') {
          const isOriginalCategory = activeCategory === initialCategory;
          const queryCategoryId = isOriginalCategory ? route.params?.categoryId : undefined;
          if (!queryCategoryId) {
            filtered = filtered.filter(p => String(p.category || '').toLowerCase() === String(activeCategory).toLowerCase());
          }
        }
      }

      // Search Filter
      if (searchQuery) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }

      // Availability Filter
      if (showAvailableOnly) {
        filtered = filtered.filter(p => p.available);
      }

      // Sorting
      if (sortBy === 'Price Low to High') {
        filtered.sort((a, b) => a.price - b.price);
      } else if (sortBy === 'Price High to Low') {
        filtered.sort((a, b) => b.price - a.price);
      } // Popular keeps default order

      setProducts(filtered);
    } catch (err) {
      setIsError(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchProducts(true);
  };

  // Initial fetch and dependency fetch
  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, showAvailableOnly, sortBy, offerId, sectionSlug, sectionStoreType, mode, route.params?.categoryId]);

  // Debounced Search
  useEffect(() => {
    if (mode === 'search') {
      const timer = setTimeout(() => {
        fetchProducts();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, mode]);

  // Callbacks
  const handleAddToCart = useCallback((product) => {
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

  const handleIncrement = useCallback((product) => {
    requireAuth(null, () => {
      if (product.isCombo || product.is_combo || product.comboItems?.length) {
        addCombo(product);
      } else {
        // Reuse the variant already in the cart for this product — a
        // single-variant product is stored WITH its variant attached, so
        // adding with variant=null here would miss the match and create a
        // duplicate line instead of incrementing it.
        const existing = items.find(i => i.product.id === product.id && (i.type || 'product') !== 'combo');
        addItem(product, 1, existing?.variant ?? product.variants?.[0] ?? null);
      }
    });
  }, [requireAuth, addCombo, addItem, items]);

  const handleDecrement = useCallback((product) => {
    if (product.isCombo || product.is_combo || product.comboItems?.length) {
      decrementCombo(product);
      return;
    }

    const existing = items.find(i => i.product.id === product.id && (i.type || 'product') !== 'combo');
    const variantId = existing?.variant?.id ?? null;
    const currentQty = existing?.quantity || 0;
    if (currentQty <= 1) {
      removeItem(product.id, 'product', variantId);
    } else {
      updateQuantity(product.id, currentQty - 1, 'product', variantId);
    }
  }, [decrementCombo, items, removeItem, updateQuantity]);

  // Renders
  const renderItem = ({ item }) => {
    const itemStoreType = item.storeType || item.store_type || item.type;
    const showModeBadge = mode === 'search' && sectionStoreType === 'all' && !!itemStoreType;
    const modeBadgeLabel = itemStoreType === 'fast_food' ? '🍔 Fast Food' : '📦 Packed';
    const modeBadgeColor = itemStoreType === 'fast_food' ? '#FFF3E0' : '#E8F5E9';
    const modeBadgeTextColor = itemStoreType === 'fast_food' ? '#E65100' : '#2E7D32';

    return (
      <View style={[styles.productWrap, { width: cardWidth }]}>
        {/* Card body tap intentionally does nothing — purchases happen on the
            card itself (Buy button / variant sheet), there is no product page
            in the customer flow. */}
        <ProductCard
          product={item}
          name={item.name}
          price={item.price}
          originalPrice={item.originalPrice}
          discountLabel={item.discountLabel}
          unit={item.unit}
          isCombo={item.isCombo}
          comboItems={item.comboItems}
          imageUri={item.imageUri}
          quantity={item.isCombo || item.is_combo || item.comboItems?.length ? getComboQuantity(item) : getProductQuantity(item.id)}
          onAdd={() => handleAddToCart(item)}
          onIncrement={() => handleIncrement(item)}
          onDecrement={() => handleDecrement(item)}
          disabled={!item.available}
          style={{ width: '100%' }}
        />
        {showModeBadge && (
          <View style={[styles.modeBadge, { backgroundColor: modeBadgeColor }]}>
            <Text style={[styles.modeBadgeText, { color: modeBadgeTextColor }]}>{modeBadgeLabel}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4, 5].map((k) => (
        <View key={k} style={styles.productWrap}>
          <SkeletonRow />
        </View>
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <EmptyState
      icon={<AppIcon name="search" size={56} color={colors.textTertiary} />}
      title={mode === 'offer' ? 'No offer products available' : 'No products found'}
      subtitle={mode === 'offer'
        ? 'No products are currently available for this offer.'
        : "Try adjusting your search or filters to find what you're looking for."}
      actionLabel={mode === 'offer' ? null : 'Clear Search & Filters'}
      onAction={mode === 'offer' ? undefined : () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSearchQuery('');
        setActiveCategory('All');
        setShowAvailableOnly(false);
        setSortBy('Popular');
      }}
      style={styles.emptyState}
    />
  );

  const renderErrorState = () => (
    <ErrorState
      icon={<AppIcon name="close" size={48} color={colors.error} />}
      message="We couldn't load the products. Please check your connection and try again."
      onRetry={() => fetchProducts()}
      style={styles.emptyState}
    />
  );

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title={
          sectionTitle
            ? sectionTitle
            : mode === 'search'
            ? 'Search Products'
            : mode === 'combos'
            ? 'Popular Combos'
            : offerId
            ? offerTitle || 'Offer Products'
            : 'Products'
        }
        onBack={() => navigation.goBack()}
        cartCount={cartItemCount}
        onCartPress={() => navigation.navigate('Cart')}
      />

      <View style={styles.controlsArea}>
        {mode === 'search' && (
          <View style={styles.searchWrap}>
            <TextInputField
              placeholder="Search items, snacks..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>
        )}


        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, sortBy === opt && styles.chipActive, { borderRadius: radius.sm }]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSortBy(opt);
              }}
            >
              <Text style={[styles.chipText, sortBy === opt && styles.chipTextActive]}>Sort: {opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.listContainer}>
        {isLoading ? (
          renderSkeleton()
        ) : isError ? (
          renderErrorState()
        ) : products.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={products}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.flatListContent}
            showsVerticalScrollIndicator={false}
            // removeClippedSubviews + windowSize tuning dramatically improves
            // scroll FPS on long Android lists by detaching off-screen rows
            // from the native view hierarchy. Has no effect on iOS but is
            // free perf on Android.
            removeClippedSubviews
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary, colors.success, colors.saffron]}
                title="Refreshing ServeLoco"
                titleColor={colors.textSecondary}
              />
            }
          />
        )}
      </View>

      <StickyMiniCart
        itemCount={cartItemCount}
        totalAmount={cartDisplayTotal}
        onPress={() => navigation.navigate('Cart')}
      />

      <VariantSheet
        visible={!!variantSheetProduct}
        product={variantSheetProduct}
        onClose={() => setVariantSheetProduct(null)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  controlsArea: {
    backgroundColor: colors.bgSurface,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  listContainer: {
    flex: 1,
  },
  flatListContent: {
    padding: spacing.lg,
    paddingBottom: layout.stickyCartScrollPadding,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  productWrap: {
    // Wrap padding inside flatlist item
  },
  modeBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  skeletonContainer: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
});
