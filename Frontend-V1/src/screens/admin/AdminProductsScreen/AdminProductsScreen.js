/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  TextInput,
  Switch,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppIcon, AppScreen, AppHeader, Button, ProductImage, SkeletonRow } from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { adminCategoriesApi, adminProductsApi } from '../../../api';
import { asArray, normalizeCategory, normalizeProduct } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AVAILABILITY = ['All', 'In Stock', 'Out of Stock'];

export default function AdminProductsScreen() {
  const navigation = useNavigation();

  const [products, setProducts] = useState([]);
  const [categoryList, setCategoryList] = useState([]);
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeAvailability, setActiveAvailability] = useState('All');
  const [sortOrder, setSortOrder] = useState('asc'); // asc or desc

  // Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  // Animations
  const listOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.9)).current;
  const modalFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const loadProducts = () => {
    setIsLoading(true);
    setIsError(false);
    adminProductsApi.getProducts()
      .then(response => {
      setProducts(asArray(response, ['products']).map(product => {
        const normalized = normalizeProduct(product);
        return {
          ...normalized,
          isAvailable: normalized.available,
          image: normalized.imageUrl,
        };
      }));
      setIsLoading(false);
      animateList();
      })
      .catch(() => {
        setIsError(true);
        setIsLoading(false);
      });
  };

  const loadCategories = () => {
    adminCategoriesApi.getCategories()
      .then(response => {
        const nextCategories = asArray(response, ['categories']).map(normalizeCategory);
        setCategoryList(nextCategories);
        setCategoryDrafts(Object.fromEntries(nextCategories.map(category => [category.id, {
          name: category.name,
          displayOrder: String(category.displayOrder || 0),
        }])));
      })
      .catch(() => setCategoryList([]));
  };

  const animateList = () => {
    listOpacity.setValue(0);
    Animated.timing(listOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const handleToggleAvailability = (id, currentStatus) => {
    const nextStatus = !currentStatus;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, isAvailable: nextStatus, available: nextStatus } : p));
    adminProductsApi.updateAvailability(id, { available: nextStatus, isAvailable: nextStatus }).catch(() => {
      setProducts(prev => prev.map(p => p.id === id ? { ...p, isAvailable: currentStatus, available: currentStatus } : p));
    });
  };

  const handleUpdateImage = (id) => {
    navigation.navigate('AdminProductForm', { productId: id, focusImage: true });
  };

  const confirmDelete = (product) => {
    setProductToDelete(product);
    setDeleteModalVisible(true);
    Animated.parallel([
      Animated.timing(modalFade, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(modalScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  };

  const closeDeleteModal = () => {
    Animated.parallel([
      Animated.timing(modalFade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setDeleteModalVisible(false);
      setProductToDelete(null);
    });
  };

  const executeDelete = () => {
    if (!productToDelete) return;
    const id = productToDelete.id;
    closeDeleteModal();
    
    adminProductsApi.deleteProduct(id).then(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setProducts(prev => prev.filter(p => p.id !== id));
    });
  };

  const handleSortToggle = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const updateCategoryDraft = (id, field, value) => {
    setCategoryDrafts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const buildCategoryPayload = (category, overrides = {}) => {
    const draft = categoryDrafts[category.id] || {};
    const name = String(overrides.name ?? draft.name ?? category.name).trim() || category.name;
    return {
      name,
      type: category.type || 'packed',
      imageId: category.image_id || category.imageId || null,
      active: category.active !== false && category.active !== 0,
      displayOrder: Number(overrides.displayOrder ?? draft.displayOrder ?? category.displayOrder ?? 0),
    };
  };

  const saveCategory = async (category) => {
    setIsSavingCategories(true);
    try {
      await adminCategoriesApi.updateCategory(category.id, buildCategoryPayload(category));
      loadCategories();
    } catch {
      loadCategories();
    } finally {
      setIsSavingCategories(false);
    }
  };

  const addCategory = async () => {
    const maxOrder = categoryList.reduce((max, category) => Math.max(max, Number(category.displayOrder || 0)), 0);
    setIsSavingCategories(true);
    try {
      await adminCategoriesApi.createCategory({
        name: `New Category ${maxOrder + 1}`,
        type: 'packed',
        active: true,
        displayOrder: maxOrder + 1,
      });
      loadCategories();
    } catch {
      loadCategories();
    } finally {
      setIsSavingCategories(false);
    }
  };

  const moveCategory = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categoryList.length) return;

    const nextCategories = [...categoryList];
    [nextCategories[index], nextCategories[targetIndex]] = [nextCategories[targetIndex], nextCategories[index]];
    const reordered = nextCategories.map((category, orderIndex) => ({
      ...category,
      displayOrder: orderIndex + 1,
    }));

    setCategoryList(reordered);
    setIsSavingCategories(true);
    try {
      await Promise.all(reordered.map(category => (
        adminCategoriesApi.updateCategory(category.id, buildCategoryPayload(category, {
          displayOrder: category.displayOrder,
        }))
      )));
      loadCategories();
    } catch {
      loadCategories();
    } finally {
      setIsSavingCategories(false);
    }
  };

  const removeCategory = async (category) => {
    setIsSavingCategories(true);
    try {
      await adminCategoriesApi.deleteCategory(category.id);
      loadCategories();
      loadProducts();
    } catch {
      loadCategories();
    } finally {
      setIsSavingCategories(false);
    }
  };

  const categories = ['All', ...new Set(categoryList.map(category => category.name).filter(Boolean))];
  const filteredProducts = products.filter(p => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory;
    const matchAvail = activeAvailability === 'All' || 
                       (activeAvailability === 'In Stock' && p.isAvailable) || 
                       (activeAvailability === 'Out of Stock' && !p.isAvailable);
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchAvail && matchSearch;
  }).sort((a, b) => {
    if (sortOrder === 'asc') return a.name.localeCompare(b.name);
    return b.name.localeCompare(a.name);
  });

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader 
        title="Manage Products" 
        onBack={() => navigation.goBack()} 
        rightNode={
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity onPress={handleSortToggle} style={styles.headerBtn}>
              <AppIcon name="settings" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('AdminProductForm')} style={styles.headerBtn}>
              <AppIcon name="add" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.topSection}>
        <View style={styles.searchBox}>
          <AppIcon name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categories.map(cat => (
            <TouchableOpacity 
              key={`cat-${cat}`}
              style={[styles.chip, activeCategory === cat && styles.chipActive]}
              onPress={() => { setActiveCategory(cat); animateList(); }}
            >
              <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { marginTop: spacing.sm }]}>
          {AVAILABILITY.map(avail => (
            <TouchableOpacity 
              key={`avail-${avail}`}
              style={[styles.chipLine, activeAvailability === avail && styles.chipLineActive]}
              onPress={() => { setActiveAvailability(avail); animateList(); }}
            >
              <Text style={[styles.chipTextLine, activeAvailability === avail && styles.chipTextLineActive]}>{avail}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.categoryManager}>
          <View style={styles.categoryManagerHeader}>
            <Text style={styles.categoryManagerTitle}>Dashboard Categories</Text>
            <TouchableOpacity onPress={addCategory} style={styles.categoryAddBtn} disabled={isSavingCategories}>
              <AppIcon name="add" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.categoryRows}>
            {categoryList.map((category, index) => (
              <View key={category.id} style={styles.categoryRow}>
                <TextInput
                  style={styles.categoryNameInput}
                  value={categoryDrafts[category.id]?.name ?? category.name}
                  onChangeText={value => updateCategoryDraft(category.id, 'name', value)}
                  onBlur={() => saveCategory(category)}
                  editable={!isSavingCategories}
                />
                <TextInput
                  style={styles.categoryOrderInput}
                  value={categoryDrafts[category.id]?.displayOrder ?? String(category.displayOrder || 0)}
                  onChangeText={value => updateCategoryDraft(category.id, 'displayOrder', value.replace(/[^0-9]/g, ''))}
                  onBlur={() => saveCategory(category)}
                  keyboardType="numeric"
                  editable={!isSavingCategories}
                />
                <TouchableOpacity onPress={() => moveCategory(index, -1)} style={styles.categoryIconBtn} disabled={isSavingCategories || index === 0}>
                  <AppIcon name="moveUp" size={16} color={index === 0 ? colors.textTertiary : colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveCategory(index, 1)} style={styles.categoryIconBtn} disabled={isSavingCategories || index === categoryList.length - 1}>
                  <AppIcon name="moveDown" size={16} color={index === categoryList.length - 1 ? colors.textTertiary : colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeCategory(category)} style={styles.categoryIconBtn} disabled={isSavingCategories}>
                  <AppIcon name="delete" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingList}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <AppIcon name="box" size={34} color={colors.error} />
          <Text style={styles.emptyTitle}>Unable to load products</Text>
          <Text style={styles.emptyText}>Check the connection and try again.</Text>
          <Button label="Retry" onPress={loadProducts} style={styles.emptyAction} />
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.center}>
          <AppIcon name="box" size={34} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No Products Found</Text>
          <Text style={styles.emptyText}>Try adjusting your filters or search query.</Text>
          <Button label="Add New Product" onPress={() => navigation.navigate('AdminProductForm')} style={styles.emptyAction} />
        </View>
      ) : (
        <Animated.ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} style={{ opacity: listOpacity }}>
          {filteredProducts.map((product, index) => (
            <AdminProductCard 
              key={product.id}
              product={product}
              index={index}
              onEdit={() => navigation.navigate('AdminProductForm', { productId: product.id })}
              onDelete={() => confirmDelete(product)}
              onToggleAvailability={() => handleToggleAvailability(product.id, product.isAvailable)}
              onUpdateImage={() => handleUpdateImage(product.id)}
              executeDeleteFlag={productToDelete?.id === product.id && !deleteModalVisible ? true : false}
            />
          ))}
        </Animated.ScrollView>
      )}

      {/* Delete Modal */}
      {deleteModalVisible && (
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalBackdrop, { opacity: modalFade }]} />
          <Animated.View style={[styles.modalContent, { opacity: modalFade, transform: [{ scale: modalScale }] }]}>
            <View style={styles.modalHeader}>
              <AppIcon name="delete" size={26} color={colors.error} />
              <Text style={styles.modalTitle}>Delete Product?</Text>
            </View>
            <Text style={styles.modalBody}>
              Are you sure you want to delete <Text style={{ fontWeight: '700' }}>{productToDelete?.name}</Text>? This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Button label="Keep Product" variant="outline" onPress={closeDeleteModal} style={styles.modalBtn} />
              <Button label="Delete" onPress={executeDelete} style={[styles.modalBtn, { backgroundColor: colors.error, borderColor: colors.error }]} />
            </View>
          </Animated.View>
        </View>
      )}

    </AppScreen>
  );
}

function AdminProductCard({ product, index, onEdit, onDelete, onToggleAvailability, onUpdateImage }) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }).start();
    Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }).start();
  }, [index, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.cardInner}>
        <View style={styles.imageContainer}>
          <ProductImage uri={product.image} width={72} height={72} borderRadius={radius.md} style={styles.productImg} />
          <TouchableOpacity style={styles.imgEditBtn} onPress={onUpdateImage}>
            <AppIcon name="image" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.cardInfo}>
          <View style={styles.infoHeader}>
            <Text style={styles.productName}>{product.name}</Text>
            <TouchableOpacity onPress={onEdit} style={styles.actionIconBtn}>
              <AppIcon name="edit" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.productCategory}>{product.category}</Text>
          <Text style={styles.productPrice}>Rs. {product.price}</Text>
          
          <View style={styles.controlRow}>
            <View style={styles.switchRow}>
              <Switch
                value={product.isAvailable}
                onValueChange={onToggleAvailability}
                trackColor={{ false: colors.border, true: colors.success + '80' }}
                thumbColor={product.isAvailable ? colors.success : colors.textTertiary}
                style={{ transform: [{ scale: 0.8 }] }}
              />
              <Text style={[styles.switchLabel, { color: product.isAvailable ? colors.success : colors.error }]}>
                {product.isAvailable ? 'In Stock' : 'Out of Stock'}
              </Text>
            </View>

            <TouchableOpacity onPress={onDelete} style={styles.actionIconBtn}>
              <AppIcon name="delete" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  headerBtn: {
    padding: spacing.xs,
  },
  topSection: {
    backgroundColor: colors.bgSurface,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgApp,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
  },
  filterScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgApp,
    borderRadius: radius.pill,
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
  chipLine: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipLineActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '1A',
  },
  chipTextLine: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextLineActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  categoryManager: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  categoryManagerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  categoryManagerTitle: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  categoryAddBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '14',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  categoryRows: {
    gap: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  categoryNameInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    ...typography.body,
    color: colors.textPrimary,
  },
  categoryOrderInput: {
    width: 48,
    minHeight: 40,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  categoryIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: spacing.lg,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row',
    padding: spacing.sm,
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    backgroundColor: colors.bgApp,
    overflow: 'hidden',
    position: 'relative',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  imgEditBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.bgSurface,
    padding: 4,
    borderTopLeftRadius: radius.sm,
  },
  cardInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'space-between',
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  productCategory: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  productPrice: {
    ...typography.labelLarge,
    color: colors.primary,
    fontWeight: '700',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  actionIconBtn: {
    padding: spacing.xs,
    backgroundColor: colors.bgApp,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadows.xl,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalBtn: {
    flex: 1,
  },
});
