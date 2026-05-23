/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  SegmentedControl,
  CategoryCard,
  ProductCard,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
  SkeletonCard,
  SkeletonRow,
} from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useCartStore, useSettingsStore } from '../../stores';
import { useAuthGate } from '../../hooks';

// Mock Data
const MOCK_CATEGORIES = [
  { id: '1', name: 'Cold Drinks', count: 42, imageUri: 'https://via.placeholder.com/80/E8F0FE/1A73E8?text=Drink' },
  { id: '2', name: 'Snacks', count: 128, imageUri: 'https://via.placeholder.com/80/FCE8E6/EA4335?text=Snack' },
  { id: '3', name: 'Fast Food', count: 24, imageUri: 'https://via.placeholder.com/80/FEF7E0/FBBC04?text=Burger' },
  { id: '4', name: 'Groceries', count: 350, imageUri: 'https://via.placeholder.com/80/E6F4EA/34A853?text=Veg' },
  { id: '5', name: 'Desserts', count: 15, imageUri: 'https://via.placeholder.com/80/F3E8FD/9334E6?text=Sweet' },
];

const MOCK_COMBOS = [
  {
    id: 'c1',
    name: 'Burger + Fries + Coke',
    price: 199,
    originalPrice: 249,
    discountLabel: '20% OFF',
    unit: '1 Combo',
    imageUri: 'https://via.placeholder.com/120/FFD54F/000000?text=Combo1',
    available: true,
  },
  {
    id: 'c2',
    name: '2 Large Pizzas + Garlic Bread',
    price: 499,
    originalPrice: 650,
    discountLabel: 'Flat ₹150 OFF',
    unit: '1 Combo',
    imageUri: 'https://via.placeholder.com/120/FF8A65/000000?text=Combo2',
    available: false, // Testing disabled state
  },
];

export default function HomeScreen() {
  const navigation = useNavigation();
  const { requireAuth } = useAuthGate();
  
  // Stores
  const { items, totalItems, displayTotal, addItem, updateQuantity, removeItem } = useCartStore();
  const activeOffer = useSettingsStore(state => state.activeOffer);
  const shopStatus = useSettingsStore(state => state.shopStatus);
  
  const [storeType, setStoreType] = useState('Packed Items');
  const [isLoading, setIsLoading] = useState(true);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  
  // Staggered entry for cards
  const staggerCatAnims = useRef(MOCK_CATEGORIES.map(() => new Animated.Value(0))).current;
  const staggerComboAnims = useRef(MOCK_COMBOS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => {
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
      
    }, 1500); // 1.5s mock loading

    return () => clearTimeout(timer);
  }, []);

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

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      {/* Header */}
      <AppHeader
        title="ServeLoco Loc Home"
        cartCount={totalItems}
        onCartPress={handleCartPress}
      />
      
      {shopStatus === 'closed' && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>Shop is currently closed. We are not accepting orders.</Text>
        </View>
      )}

      {isLoading ? (
        <ScrollView style={styles.skeletonContainer}>
           <LoadingSkeleton style={{ height: 48, borderRadius: radius.md, marginBottom: spacing.lg }} />
           <LoadingSkeleton style={{ height: 120, borderRadius: radius.lg, marginBottom: spacing.xl }} />
           
           <Text style={styles.sectionTitle}>Shop by Category</Text>
           <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg }}>
             <SkeletonCard />
             <SkeletonCard />
             <SkeletonCard />
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
            <Text style={styles.sectionTitle}>Shop by Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {MOCK_CATEGORIES.map((cat, idx) => (
                <Animated.View 
                  key={cat.id} 
                  style={{ 
                    marginLeft: idx === 0 ? 0 : spacing.sm,
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
                    onPress={() => handleCategoryPress(cat)}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          </View>

          {/* Combo Deals (Vertical List of Cards) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular Combos</Text>
            <View style={styles.comboList}>
              {MOCK_COMBOS.map((combo, idx) => (
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
                    disabled={!combo.available} // Handled dynamically based on mock property
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
  hScroll: {
    paddingHorizontal: spacing.lg,
  },
  comboList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  comboWrap: {
    marginBottom: spacing.sm,
  },
});
