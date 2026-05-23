import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  TextInputField,
  ProductCard,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
  SkeletonRow,
} from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useCartStore } from '../../stores';
import { useAuthGate } from '../../hooks';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Mock Data
const MOCK_PRODUCTS = [
  { id: 'p1', name: 'Farm Fresh Tomatoes', price: 40, originalPrice: 50, discountLabel: '20% OFF', unit: '1 kg', category: 'Groceries', available: true, imageUri: 'https://via.placeholder.com/120/E6F4EA/34A853?text=Tomato' },
  { id: 'p2', name: 'Whole Wheat Bread', price: 55, originalPrice: null, discountLabel: null, unit: '1 loaf', category: 'Daily Essentials', available: true, imageUri: 'https://via.placeholder.com/120/FFF8E1/FFC107?text=Bread' },
  { id: 'p3', name: 'Coca Cola', price: 40, originalPrice: null, discountLabel: null, unit: '750 ml', category: 'Cold Drinks', available: true, imageUri: 'https://via.placeholder.com/120/E8F0FE/1A73E8?text=Coke' },
  { id: 'p4', name: 'Lays Magic Masala', price: 20, originalPrice: null, discountLabel: null, unit: '50 g', category: 'Snacks', available: false, imageUri: 'https://via.placeholder.com/120/FCE8E6/EA4335?text=Lays' },
  { id: 'p5', name: 'Spicy Chicken Burger', price: 149, originalPrice: 199, discountLabel: '₹50 OFF', unit: '1 pc', category: 'Fast Food', available: true, imageUri: 'https://via.placeholder.com/120/FEF7E0/FBBC04?text=Burger' },
  { id: 'p6', name: 'Chocolate Truffle Pastry', price: 89, originalPrice: 120, discountLabel: '25% OFF', unit: '1 pc', category: 'Desserts', available: true, imageUri: 'https://via.placeholder.com/120/F3E8FD/9334E6?text=Pastry' },
];

const CATEGORY_CHIPS = ['All', 'Groceries', 'Daily Essentials', 'Cold Drinks', 'Snacks', 'Fast Food', 'Desserts'];
const SORT_OPTIONS = ['Popular', 'Price Low to High', 'Price High to Low'];

export default function ProductListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { requireAuth } = useAuthGate();
  
  // Params
  const mode = route.params?.mode || 'category'; // 'search' | 'category'
  const initialCategory = route.params?.categoryName || 'All';
  const offerId = route.params?.offerId || null;

  // Stores
  const { items, totalItems, displayTotal, addItem, updateQuantity, removeItem } = useCartStore();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState('Popular');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [products, setProducts] = useState([]);

  // Filter crossfade animation
  const listOpacity = useRef(new Animated.Value(1)).current;

  const fetchProducts = (forceError = false) => {
    setIsLoading(true);
    setIsError(false);
    
    // Simulate network
    setTimeout(() => {
      if (forceError) {
        setIsError(true);
        setIsLoading(false);
        return;
      }
      
      let filtered = [...MOCK_PRODUCTS];

      // Offer Filter
      if (offerId) {
        filtered = filtered.filter(p => !!p.discountLabel);
      }

      // Search Filter
      if (searchQuery) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }

      // Category Filter
      if (activeCategory !== 'All') {
        filtered = filtered.filter(p => p.category === activeCategory);
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

      // Animate list update (Crossfade)
      Animated.sequence([
        Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
        Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();

      setProducts(filtered);
      setIsLoading(false);
    }, 600); // Simulated delay
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

  const handleProductPress = (product) => {
    navigation.navigate('ProductDetail', { id: product.id });
  };

  // Renders
  const FadeInItem = ({ children, index }) => {
    const anim = useRef(new Animated.Value(0)).current;
    
    useEffect(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: index * 100, // Stagger based on index
        useNativeDriver: true,
      }).start();
    }, [anim, index]);

    return (
      <Animated.View
        style={{
          opacity: anim,
          transform: [{
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0]
            })
          }]
        }}
      >
        {children}
      </Animated.View>
    );
  };

  const renderItem = ({ item, index }) => (
    <Animated.View
      style={{
        opacity: listOpacity,
      }}
    >
      <FadeInItem index={index}>
        <View style={styles.productWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => handleProductPress(item)}>
            <ProductCard
              name={item.name}
              price={item.price}
              originalPrice={item.originalPrice}
              discountLabel={item.discountLabel}
              unit={item.unit}
              imageUri={item.imageUri}
              quantity={getQty(item.id)}
              onAdd={() => handleAddToCart(item)}
              onIncrement={() => handleIncrement(item)}
              onDecrement={() => handleDecrement(item)}
              disabled={!item.available}
            />
          </TouchableOpacity>
        </View>
      </FadeInItem>
    </Animated.View>
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
      <Text style={styles.emptyEmoji}>🔍</Text>
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
      <Text style={styles.emptyEmoji}>⚠️</Text>
      <Text style={styles.emptyTitle}>Oops, something went wrong</Text>
      <Text style={styles.emptyDesc}>We couldn't load the products. Please check your connection and try again.</Text>
      <Button label="Retry" onPress={() => fetchProducts()} />
    </View>
  );

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title={mode === 'search' ? 'Search Products' : (offerId ? 'Special Offers' : 'Products')}
        onBack={() => navigation.goBack()}
        cartCount={totalItems}
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
          {CATEGORY_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip}
              style={[styles.chip, activeCategory === chip && styles.chipActive]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setActiveCategory(chip);
              }}
            >
              <Text style={[styles.chipText, activeCategory === chip && styles.chipTextActive]}>{chip}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, showAvailableOnly && styles.chipActive]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowAvailableOnly(!showAvailableOnly);
            }}
          >
            <Text style={[styles.chipText, showAvailableOnly && styles.chipTextActive]}>Available Only</Text>
          </TouchableOpacity>
        </ScrollView>

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
            contentContainerStyle={styles.flatListContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          />
        )}
      </View>

      <StickyMiniCart
        itemCount={totalItems}
        totalAmount={displayTotal}
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
    paddingBottom: spacing.xxxl * 3, // space for sticky cart
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
