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
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  SegmentedControl,
  CategoryCard,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
} from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';
import { useCartStore } from '../../../stores';
import { productsApi } from '../../../api';
import { asArray, normalizeCategory } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEFAULT_CHIPS = ['All', 'Bestsellers', 'New Arrivals', 'Offers'];

export default function CategoriesScreen() {
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { totalItems, displayTotal } = useCartStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [storeType, setStoreType] = useState('Packed Items');
  const [activeChip, setActiveChip] = useState('All');
  const [categories, setCategories] = useState([]);
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  const [isError, setIsError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  
  const displayCategories = categories.filter(category => {
    const type = String(category.type || '').toLowerCase();
    const typeMatches = !type || type === storeType.toLowerCase();
    const chipMatches = activeChip === 'All'
      || category.subcategories?.some(item => String(item.name || item).toLowerCase() === activeChip.toLowerCase());
    return typeMatches && chipMatches;
  });

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const staggerAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    staggerAnims.forEach(anim => anim.setValue(0));

    productsApi.getCategories({ type: storeType })
      .then(response => {
        const nextCategories = asArray(response, ['categories']).map(normalizeCategory);
        setCategories(nextCategories);
        const nextChips = [
          'All',
          ...new Set(nextCategories.flatMap(category => (
            category.subcategories || []
          )).map(item => item.name || item).filter(Boolean)),
        ];
        setChips(nextChips.length > 1 ? nextChips : DEFAULT_CHIPS);
      })
      .catch(() => setIsError(true))
      .finally(() => {
      setIsLoading(false);
      
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.stagger(
          50,
          staggerAnims.map(anim => Animated.spring(anim, { toValue: 1, friction: 7, useNativeDriver: true }))
        ),
      ]).start();
      });

  }, [storeType, reloadToken, fadeAnim, slideAnim, staggerAnims]);

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

  const gridGap = spacing.sm;
  const gridWidth = windowWidth - (spacing.lg * 2);
  const categoryCardWidth = Math.floor((gridWidth - (gridGap * 3)) / 4);
  const categoryImageSize = Math.max(38, categoryCardWidth - spacing.sm);

  const renderSkeletonGrid = () => (
        <View style={styles.grid}>
          {[1, 2, 3, 4, 5, 6].map((k) => (
        <View key={k} style={[styles.gridItem, { width: categoryCardWidth }]}>
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
            icon: <AppIcon name="search" size={20} color={colors.textPrimary} />,
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
            {chips.map((chip) => {
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
          ) : isError ? (
            <View style={styles.emptyState}>
              <AppIcon name="close" size={48} color={colors.error} style={styles.emptyEmoji} />
              <Text style={styles.emptyTitle}>Failed to load categories</Text>
              <Text style={styles.emptyDesc}>Please check your connection and try again.</Text>
              <Button
                label="Retry"
                onPress={() => setReloadToken(value => value + 1)}
                style={styles.emptyBtn}
              />
            </View>
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
                        { width: categoryCardWidth },
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
                        imageWidth={categoryImageSize}
                        imageHeight={Math.max(36, categoryImageSize * 0.66)}
                        style={{ width: categoryCardWidth }}
                        onPress={() => handleCategoryPress(cat)}
                      />
                    </Animated.View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <AppIcon name="box" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
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
    paddingHorizontal: 0,
    paddingTop: spacing.md,
  },
  gridItem: {
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
