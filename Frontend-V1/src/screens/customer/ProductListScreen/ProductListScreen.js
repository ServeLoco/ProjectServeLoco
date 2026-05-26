/* eslint-disable react-hooks/exhaustive-deps */
import React, { useMemo, useState, useEffect } from 'react';
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
  Button,
  SkeletonRow,
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
  const sectionSlug = route.params?.sectionSlug || null;
  const sectionTitle = route.params?.sectionTitle || null;
  const sectionStoreType = route.params?.storeType || 'all';

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.floor((windowWidth - (spacing.lg * 2) - spacing.md) / 2);

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

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState('Popular');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [products, setProducts] = useState([]);
  const cartItemCount = useMemo(
    () => items.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [items]
  );
  const cartDisplayTotal = useMemo(
    () => items.reduce((total, item) => total + ((Number(item.product?.price) || 0) * (Number(item.quantity) || 0)), 0),
    [items]
  );

  const fetchProducts = async () => {
    setIsLoading(true);
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

        // Offer Filter
        if (offerId) {
          filtered = filtered.filter(p => !!p.discountLabel);
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
    }
  };

  // Initial fetch and dependency fetch
  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, showAvailableOnly, sortBy, offerId]);

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
  const getQty = (productId) => {
    const item = items.find(i => i.product.id === productId && (i.type || 'product') !== 'combo');
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

  const handleProductPress = (product) => {
    const isCombo = product.isCombo || product.is_combo || product.comboItems?.length;
    navigation.navigate('ProductDetail', {
      id: product.id,
      type: isCombo ? 'combo' : 'product',
      product,
    });
  };

  // Renders
  const renderItem = ({ item }) => (
    <View style={[styles.productWrap, { width: cardWidth }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => handleProductPress(item)}>
        <ProductCard
          name={item.name}
          price={item.price}
          originalPrice={item.originalPrice}
          discountLabel={item.discountLabel}
          unit={item.unit}
          isCombo={item.isCombo}
          comboItems={item.comboItems}
          imageUri={item.imageUri}
          quantity={item.isCombo || item.is_combo || item.comboItems?.length ? getComboQuantity(item) : getQty(item.id)}
          onAdd={() => handleAddToCart(item)}
          onIncrement={() => handleIncrement(item)}
          onDecrement={() => handleDecrement(item)}
          disabled={!item.available}
          style={{ width: '100%' }}
        />
      </TouchableOpacity>
    </View>
  );

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
    <View style={styles.emptyState}>
      <AppIcon name="search" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
      <Text style={styles.emptyTitle}>No products found</Text>
      <Text style={styles.emptyDesc}>Try adjusting your search or filters to find what you're looking for.</Text>
      <Button 
        label="Clear Search & Filters" 
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSearchQuery('');
          setActiveCategory('All');
          setShowAvailableOnly(false);
          setSortBy('Popular');
        }} 
      />
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <AppIcon name="close" size={48} color={colors.error} style={styles.emptyEmoji} />
      <Text style={styles.emptyTitle}>Oops, something went wrong</Text>
      <Text style={styles.emptyDesc}>We couldn't load the products. Please check your connection and try again.</Text>
      <Button label="Retry" onPress={() => fetchProducts()} />
    </View>
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
            ? 'Special Offers'
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
          />
        )}
      </View>

      <StickyMiniCart
        itemCount={cartItemCount}
        totalAmount={cartDisplayTotal}
        onPress={() => navigation.navigate('Cart')}
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
