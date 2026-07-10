import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  SegmentedControl,
  StickyMiniCart,
  Button,
  LoadingSkeleton,
  PressableScale,
  ProductImage,
  ErrorState,
} from '../../../components';
import { colors, typography, spacing, radius, shadows, layout } from '../../../theme';
import { useCartStore } from '../../../stores';
import { useStoreModes } from '../../../hooks';
import { productsApi } from '../../../api';
import { trackEvent } from '../../../api/analyticsClient';
import { asArray, normalizeCategory } from '../../../utils';


export default function CategoriesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const items = useCartStore(state => state.items);
  const cartItemCount = useMemo(
    () => items.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [items]
  );
  const cartDisplayTotal = useMemo(
    () => items.reduce((total, item) => total + ((Number(item.product?.price) || 0) * (Number(item.quantity) || 0)), 0),
    [items]
  );
  
  const { modes } = useStoreModes();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [storeType, setStoreType] = useState(route.params?.storeType || 'packed');
  const [activeChip, setActiveChip] = useState('All');
  const [categories, setCategories] = useState([]);
  const [chips, setChips] = useState(['All']);
  const [isError, setIsError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const normalizedStoreType = storeType;

  const displayCategories = useMemo(() => categories.filter(category => {
    const type = String(category.type || '').toLowerCase();
    const typeMatches = !type || type === normalizedStoreType.toLowerCase();
    const chipMatches = activeChip === 'All'
      || category.subcategories?.some(item => String(item.name || item).toLowerCase() === activeChip.toLowerCase());
    return typeMatches && chipMatches;
  }), [categories, normalizedStoreType, activeChip]);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const staggerAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!isRefreshing) {
      setIsLoading(true);
    }
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
        setChips(nextChips);
      })
      .catch(() => setIsError(true))
      .finally(() => {
      setIsLoading(false);
      setIsRefreshing(false);
      
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

  const handleRefresh = () => {
    setIsRefreshing(true);
    setReloadToken(value => value + 1);
  };

  const handleSearchPress = () => {
    navigation.navigate('ProductList', { mode: 'search', storeType: normalizedStoreType });
  };

  const handleCategoryPress = (category) => {
    trackEvent('category_view', { categoryId: Number(category.id) });
    navigation.navigate('ProductList', { categoryId: category.id, categoryName: category.name, storeType: normalizedStoreType });
  };

  const handleCartPress = () => {
    navigation.navigate('Cart');
  };

  const handleChipPress = (chip) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveChip(chip);
  };

  const renderSkeletonList = () => (
    <View style={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((k) => (
        <View key={k} style={styles.skeletonListItem}>
          <LoadingSkeleton style={styles.skeletonListImage} />
          <View style={styles.skeletonListTextWrapper}>
            <LoadingSkeleton style={styles.skeletonListLine} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      {/* Header */}
      <AppHeader
        title="Categories"
      />

      <View style={styles.content}>
        {/* Segmented Control */}
        <View style={styles.toggleContainer}>
          <SegmentedControl
            options={modes.map(m => m.slug)}
            renderLabel={(slug) => modes.find(m => m.slug === slug)?.label || slug}
            selectedOption={storeType}
            onSelect={(opt) => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setStoreType(opt);
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

        {/* List / Empty State */}
        <View style={styles.listContainer}>
          {isLoading ? (
            renderSkeletonList()
          ) : isError ? (
            <ErrorState
              message="Unable to load categories. Tap to retry."
              onRetry={() => setReloadToken(value => value + 1)}
              retryLabel="Retry"
              style={styles.emptyState}
            />
          ) : (
            <Animated.ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
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
            >
              {displayCategories.length > 0 ? (
                <View style={styles.list}>
                  {displayCategories.map((cat, idx) => (
                    <Animated.View
                      key={cat.id}
                      style={[
                        styles.listItem,
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
                      <PressableScale
                        onPress={() => handleCategoryPress(cat)}
                        style={styles.categoryListRow}
                        scaleTo={0.97}
                        accessibilityRole="button"
                        accessibilityLabel={cat.name}
                      >
                        <View style={styles.listImageWrapper}>
                          <ProductImage
                            uri={cat.imageUri}
                            width="100%"
                            height="100%"
                            borderRadius={radius.sm}
                            resizeMode="contain"
                          />
                        </View>
                        <View style={styles.listTextContainer}>
                          <Text style={styles.categoryListRowName}>{cat.name}</Text>
                          {cat.count !== undefined && (
                            <Text style={styles.categoryListRowCount}>{cat.count} items</Text>
                          )}
                        </View>
                        <View style={styles.chevronWrapper}>
                          <AppIcon name="chevronRight" size={18} color={colors.textSecondary} />
                        </View>
                      </PressableScale>
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
  content: {
    flex: 1,
  },
  toggleContainer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  searchBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
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
    paddingBottom: layout.stickyCartScrollPadding,
  },
  list: {
    paddingTop: spacing.sm,
  },
  listItem: {
    marginBottom: spacing.xs,
  },
  categoryListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listImageWrapper: {
    width: 52,
    height: 52,
    backgroundColor: '#F5F6F8',
    borderRadius: radius.md,
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  categoryListRowName: {
    ...typography.labelLarge,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  categoryListRowCount: {
    ...typography.labelSmall,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevronWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: spacing.sm,
  },
  skeletonListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonListImage: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
  },
  skeletonListTextWrapper: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  skeletonListLine: {
    height: 16,
    width: '60%',
    borderRadius: radius.xs,
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
