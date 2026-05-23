import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  SegmentedControl,
  CategoryCard,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
} from '../../components';
import { colors, typography, spacing, radius } from '../../theme';
import { useCartStore } from '../../stores';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Mock Data
const MOCK_CATEGORIES = [
  { id: '1', name: 'Cold Drinks', count: 42, imageUri: 'https://via.placeholder.com/80/E8F0FE/1A73E8?text=Drink' },
  { id: '2', name: 'Snacks', count: 128, imageUri: 'https://via.placeholder.com/80/FCE8E6/EA4335?text=Snack' },
  { id: '3', name: 'Fast Food', count: 24, imageUri: 'https://via.placeholder.com/80/FEF7E0/FBBC04?text=Burger' },
  { id: '4', name: 'Groceries', count: 350, imageUri: 'https://via.placeholder.com/80/E6F4EA/34A853?text=Veg' },
  { id: '5', name: 'Desserts', count: 15, imageUri: 'https://via.placeholder.com/80/F3E8FD/9334E6?text=Sweet' },
  { id: '6', name: 'Daily Essentials', count: 85, imageUri: 'https://via.placeholder.com/80/FFF8E1/FFC107?text=Daily' },
];

const MOCK_CHIPS = ['All', 'Bestsellers', 'New Arrivals', 'Offers'];

export default function CategoriesScreen() {
  const navigation = useNavigation();
  const { totalItems, displayTotal } = useCartStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [storeType, setStoreType] = useState('Packed Items');
  const [activeChip, setActiveChip] = useState('All');
  
  // To test empty state, we can simulate an empty list when "Fast Food" is selected
  const displayCategories = storeType === 'Packed Items' ? MOCK_CATEGORIES : [];

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const staggerAnims = useRef(MOCK_CATEGORIES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Reset animations when tab changes to simulate network fetch
    setIsLoading(true);
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    staggerAnims.forEach(anim => anim.setValue(0));

    const timer = setTimeout(() => {
      setIsLoading(false);
      
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.stagger(
          50,
          staggerAnims.map(anim => Animated.spring(anim, { toValue: 1, friction: 7, useNativeDriver: true }))
        ),
      ]).start();
      
    }, 800); // 0.8s mock load

    return () => clearTimeout(timer);
  }, [storeType, fadeAnim, slideAnim, staggerAnims]);

  const handleSearchPress = () => {
    navigation.navigate('ProductList', { mode: 'search' });
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('ProductList', { categoryId: category.id, categoryName: category.name });
  };

  const handleCartPress = () => {
    navigation.navigate('Cart');
  };

  const handleChipPress = (chip) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveChip(chip);
  };

  const renderSkeletonGrid = () => (
    <View style={styles.grid}>
      {[1, 2, 3, 4, 5, 6].map((k) => (
        <View key={k} style={styles.gridItem}>
          <LoadingSkeleton style={{ height: 140, borderRadius: radius.md }} />
        </View>
      ))}
    </View>
  );

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      {/* Header */}
      <AppHeader
        title="Categories"
        cartCount={totalItems}
        onCartPress={handleCartPress}
        rightActions={[
          {
            icon: <Text style={{ fontSize: 20 }}>🔍</Text>,
            onPress: handleSearchPress,
            label: 'Search',
          }
        ]}
      />

      <View style={styles.content}>
        {/* Segmented Control */}
        <View style={styles.toggleContainer}>
          <SegmentedControl
            options={['Packed Items', 'Fast Food']}
            selectedOption={storeType}
            onSelect={(opt) => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setStoreType(opt);
            }}
          />
        </View>

        {/* Subcategory Chips */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {MOCK_CHIPS.map((chip) => {
              const isActive = activeChip === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  activeOpacity={0.7}
                  onPress={() => handleChipPress(chip)}
                  style={[styles.chip, isActive && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Grid / Empty State */}
        <View style={styles.listContainer}>
          {isLoading ? (
            renderSkeletonGrid()
          ) : (
            <Animated.ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
            >
              {displayCategories.length > 0 ? (
                <View style={styles.grid}>
                  {displayCategories.map((cat, idx) => (
                    <Animated.View
                      key={cat.id}
                      style={[
                        styles.gridItem,
                        {
                          opacity: staggerAnims[idx] || 1,
                          transform: [{
                            translateY: (staggerAnims[idx] || new Animated.Value(1)).interpolate({
                              inputRange: [0, 1],
                              outputRange: [20, 0],
                            })
                          }]
                        }
                      ]}
                    >
                      <CategoryCard
                        name={cat.name}
                        count={cat.count}
                        imageUri={cat.imageUri}
                        onPress={() => handleCategoryPress(cat)}
                      />
                    </Animated.View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>😕</Text>
                  <Text style={styles.emptyTitle}>No items found</Text>
                  <Text style={styles.emptyDesc}>We couldn't find any categories for this store type.</Text>
                  <Button 
                    label="View All Products" 
                    onPress={() => navigation.navigate('ProductList')}
                    style={styles.emptyBtn}
                  />
                </View>
              )}
            </Animated.ScrollView>
          )}
        </View>
      </View>

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
  content: {
    flex: 1,
  },
  toggleContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chipsScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSurface,
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl * 2, // Space for sticky cart
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  gridItem: {
    width: '48%', // 2 columns
    marginBottom: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
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
  emptyBtn: {
    minWidth: 200,
  },
});
