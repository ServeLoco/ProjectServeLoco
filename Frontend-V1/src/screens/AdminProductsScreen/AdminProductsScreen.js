/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Switch,
  Image,
  Modal,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppScreen, AppHeader, Button } from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Mock API
const initialMockProducts = [
  { id: 'P1', name: 'Margherita Pizza', category: 'Pizza', price: 250, isAvailable: true, image: 'https://via.placeholder.com/150' },
  { id: 'P2', name: 'Garlic Bread', category: 'Sides', price: 90, isAvailable: true, image: 'https://via.placeholder.com/150' },
  { id: 'P3', name: 'Farmhouse Pizza', category: 'Pizza', price: 350, isAvailable: false, image: 'https://via.placeholder.com/150' },
  { id: 'P4', name: 'Cold Coffee', category: 'Beverages', price: 120, isAvailable: true, image: 'https://via.placeholder.com/150' },
  { id: 'P5', name: 'Cheese Dip', category: 'Sides', price: 30, isAvailable: true, image: 'https://via.placeholder.com/150' },
];

const CATEGORIES = ['All', 'Pizza', 'Sides', 'Beverages'];
const AVAILABILITY = ['All', 'In Stock', 'Out of Stock'];

export default function AdminProductsScreen() {
  const navigation = useNavigation();

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, []);

  const loadProducts = () => {
    setIsLoading(true);
    setTimeout(() => {
      setProducts(initialMockProducts);
      setIsLoading(false);
      animateList();
    }, 800);
  };

  const animateList = () => {
    listOpacity.setValue(0);
    Animated.timing(listOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const handleToggleAvailability = (id, currentStatus) => {
    // Mock PATCH /admin/products/:id/availability
    setProducts(prev => prev.map(p => p.id === id ? { ...p, isAvailable: !currentStatus } : p));
  };

  const handleUpdateImage = (id) => {
    // Mock PATCH /admin/products/:id/image
    console.log('Update Image trigger for', id);
    alert('Mock Image Picker opened');
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
    
    // Animate row out
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleSortToggle = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

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
              <Text style={styles.headerIcon}>{sortOrder === 'asc' ? 'Desc' : 'Asc'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('AdminProductForm')} style={styles.headerBtn}>
              <Text style={styles.headerIcon}>Add</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.topSection}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>Search</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORIES.map(cat => (
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
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.emptyText}>Loading products...</Text>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>Box</Text>
          <Text style={styles.emptyTitle}>No Products Found</Text>
          <Text style={styles.emptyText}>Try adjusting your filters or search query.</Text>
          <Button label="Add New Product" onPress={() => navigation.navigate('AdminProductForm')} style={{ marginTop: spacing.lg }} />
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
              <Text style={styles.modalEmoji}>Delete</Text>
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
  const heightAnim = useRef(new Animated.Value(140)).current; // Approximate height

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }).start();
    Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }).start();
  }, [index, fadeAnim, slideAnim]);

  // Exposed collapse method would be ideal, but for now we simulate via props or just direct context
  // To strictly meet "Animate deleted product row collapse/fade-out", we'll just handle it within the parent or here if we pass a trigger.
  // We'll skip complex ref forwarding for a mock and just let the parent unmount it for now, since unmount animations in standard RN lists require third party or custom state management.
  // Actually, let's keep it simple.

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.cardInner}>
        <View style={styles.imageContainer}>
          <Image source={{ uri: product.image }} style={styles.productImg} />
          <TouchableOpacity style={styles.imgEditBtn} onPress={onUpdateImage}>
            <Text style={styles.imgEditIcon}>Image</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.cardInfo}>
          <View style={styles.infoHeader}>
            <Text style={styles.productName}>{product.name}</Text>
            <TouchableOpacity onPress={onEdit} style={styles.actionIconBtn}>
              <Text style={styles.actionIcon}>Edit</Text>
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
              <Text style={styles.actionIcon}>Delete</Text>
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
  headerIcon: {
    fontSize: 20,
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
    fontSize: 16,
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderTopLeftRadius: radius.sm,
  },
  imgEditIcon: {
    fontSize: 12,
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
  actionIcon: {
    fontSize: 14,
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
  modalEmoji: {
    fontSize: 40,
    marginBottom: spacing.sm,
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
