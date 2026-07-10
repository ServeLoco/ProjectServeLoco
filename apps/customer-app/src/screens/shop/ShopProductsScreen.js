import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { shopApi, subscribeRealtime } from '../../api';
import AppIcon from '../../components/AppIcon';
import ShopToggle from '../../components/shop/ShopToggle';

const UNGROUPED_KEY = '__ungrouped__';

/**
 * ShopProductsScreen
 * Premium product catalog for shop owners. Products are sectioned by group,
 * each group with its own Active/Inactive toggle, plus search, group creation,
 * and product reassignment.
 */
export default function ShopProductsScreen() {
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | group.id | UNGROUPED_KEY
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [pickerProduct, setPickerProduct] = useState(null); // product being reassigned

  const fetchAll = useCallback(async () => {
    try {
      const [productsRes, groupsRes] = await Promise.all([
        shopApi.getMyProducts(),
        shopApi.getMyGroups(),
      ]);
      setProducts(productsRes.products || []);
      setGroups(groupsRes.groups || []);
      setLoadError(false);
    } catch (_) {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  useEffect(() => {
    const unsubForeground = subscribeRealtime('lifecycle.foreground', () => fetchAll());
    const unsubReconnected = subscribeRealtime('lifecycle.reconnected', () => fetchAll());
    return () => {
      unsubForeground();
      unsubReconnected();
    };
  }, [fetchAll]);

  const handleProductToggle = useCallback(async (product, value) => {
    if (!product || product.id == null) return;
    const safeValue = Boolean(value);
    setProducts(prev => prev.map(p => (p && p.id === product.id ? { ...p, available: safeValue } : p)));
    try {
      await shopApi.toggleProduct(product.id, safeValue);
    } catch (_) {
      setProducts(prev => prev.map(p => (p && p.id === product.id ? { ...p, available: !safeValue } : p)));
    }
  }, []);

  const handleGroupToggle = useCallback(async (group, value) => {
    if (!group || group.id == null) return;
    const safeValue = Boolean(value);
    setGroups(prev => prev.map(g => (g && g.id === group.id ? { ...g, active: safeValue } : g)));
    try {
      await shopApi.updateGroup(group.id, { active: safeValue });
    } catch (_) {
      setGroups(prev => prev.map(g => (g && g.id === group.id ? { ...g, active: !safeValue } : g)));
    }
  }, []);

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      await shopApi.createGroup(newGroupName.trim());
      setNewGroupName('');
      setNewGroupModalOpen(false);
      fetchAll();
    } catch (err) {
      Alert.alert('Could not create group', err?.message || 'Please try again.');
    } finally {
      setCreatingGroup(false);
    }
  }, [newGroupName, fetchAll]);

  const handleDeleteGroup = useCallback((group) => {
    if (!group || group.id == null) return;
    Alert.alert(
      'Delete group',
      `Delete "${group.name || 'this group'}"? Its products become ungrouped, not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await shopApi.deleteGroup(group.id);
              setActiveTab(prev => (prev === group.id ? 'all' : prev));
              fetchAll();
            } catch (err) {
              Alert.alert('Could not delete group', err?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  }, [fetchAll]);

  const handleAssignGroup = useCallback(async (groupId) => {
    if (!pickerProduct) return;
    const product = pickerProduct;
    setPickerProduct(null);
    try {
      await shopApi.assignProductGroup(product.id, groupId);
      fetchAll();
    } catch (err) {
      Alert.alert('Could not move product', err?.message || 'Please try again.');
    }
  }, [pickerProduct, fetchAll]);

  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    setActiveTab('all'); // typing a search resets any tab filter, matches mockup behavior
  }, []);

  const handleTabPress = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  const filteredProducts = useMemo(() => {
    if (!isSearching) return products;
    const q = searchQuery.trim().toLowerCase();
    return products.filter(p => p.name?.toLowerCase().includes(q));
  }, [products, searchQuery, isSearching]);

  const sections = useMemo(() => {
    const byGroup = {};
    for (const p of filteredProducts) {
      const key = p.groupId ?? p.group_id ?? UNGROUPED_KEY;
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(p);
    }
    const showAll = activeTab === 'all';
    const groupSections = groups
      .map(g => ({ group: g, items: byGroup[g.id] || [] }))
      .filter(s => (showAll || activeTab === s.group.id))
      .filter(s => !isSearching || s.items.length > 0);
    const rawUngrouped = byGroup[UNGROUPED_KEY] || [];
    const ungrouped = (showAll || activeTab === UNGROUPED_KEY) ? rawUngrouped : [];
    return { groupSections, ungrouped };
  }, [filteredProducts, groups, isSearching, activeTab]);

  const tabs = useMemo(() => {
    const list = [{ id: 'all', name: 'All' }];
    groups.forEach(g => list.push({ id: g.id, name: g.name, active: g.active }));
    const ungroupedItems = products.filter(p => (p.groupId ?? p.group_id) == null);
    if (ungroupedItems.length > 0) {
      list.push({ id: UNGROUPED_KEY, name: 'Ungrouped', active: ungroupedItems.every(p => p.available) });
    }
    return list;
  }, [groups, products]);

  const totalCount = products.length;
  const availableCount = useMemo(() => products.filter(p => p.available).length, [products]);

  const renderProductRow = (item) => {
    if (!item || item.id == null) return null;
    const isAvailable = Boolean(item.available);
    const variants = item.variants || [];
    const variantLabel = variants
      .map(v => `${v.label} ₹${Number(v.price).toFixed(0)}`)
      .join(' · ');
    return (
      <View key={item.id} style={styles.row}>
        <View style={[styles.rowIconWrap, !isAvailable && styles.rowIconWrapMuted]}>
          <AppIcon name="box" size={18} color={isAvailable ? colors.saffronDark : colors.textTertiary} />
        </View>
        <View style={styles.rowNameWrap}>
          <Text style={[styles.rowName, !isAvailable && styles.rowNameOff]} numberOfLines={1}>{item.name || 'Unnamed product'}</Text>
          {variants.length > 0 ? (
            <Text style={[styles.rowPrice, !isAvailable && styles.rowPriceOff]} numberOfLines={1}>{variantLabel}</Text>
          ) : item.price != null && (
            <Text style={[styles.rowPrice, !isAvailable && styles.rowPriceOff]}>₹{Number(item.price).toFixed(2)}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.rowMoveBtn}
          onPress={() => setPickerProduct(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <AppIcon name="chevronRight" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <ShopToggle
          value={isAvailable}
          onValueChange={(v) => handleProductToggle(item, v)}
          activeColor={colors.success}
          size="md"
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <TouchableOpacity style={styles.newGroupBtn} onPress={() => setNewGroupModalOpen(true)} activeOpacity={0.8}>
          <AppIcon name="add" size={16} color={colors.saffronDark} />
          <Text style={styles.newGroupBtnText}>New Group</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <AppIcon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {isSearching && (
            <TouchableOpacity style={styles.searchClearBtn} onPress={() => handleSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <AppIcon name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {products.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryTextBold}>{totalCount}</Text> products
          </Text>
          <View style={styles.summaryPill}>
            <AppIcon name="check" size={12} color={colors.successDark} />
            <Text style={styles.summaryPillText}>{availableCount} available</Text>
          </View>
        </View>
      )}

      {products.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
          contentContainerStyle={styles.tabsRowContent}
        >
          {tabs.map(t => {
            const isActive = activeTab === t.id;
            const isAll = t.id === 'all';
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
                onPress={() => handleTabPress(t.id)}
                activeOpacity={0.8}
              >
                {!isAll && (
                  <View style={[styles.tabDot, !t.active && styles.tabDotOff]} />
                )}
                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>{t.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && products.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.saffron} />
      ) : (
        <FlatList
          data={[{ key: 'sections' }]}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
          renderItem={() => (
            <>
              {sections.groupSections.map(({ group, items }) => (
                <View key={group.id} style={styles.groupBlock}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupTitleWrap}>
                      <View style={[styles.groupIconWrap, !group.active && styles.groupIconWrapMuted]}>
                        <AppIcon name="box" size={18} color={group.active ? colors.saffronDark : colors.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupName}>{group.name}</Text>
                        <Text style={styles.groupCount}>
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.groupActions}>
                      <TouchableOpacity
                        style={styles.groupDeleteBtn}
                        onPress={() => handleDeleteGroup(group)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <AppIcon name="delete" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                      <ShopToggle
                        value={Boolean(group.active)}
                        onValueChange={(v) => handleGroupToggle(group, v)}
                        activeColor={colors.saffron}
                        size="md"
                      />
                    </View>
                  </View>
                  <View style={styles.groupCard}>
                    {items.length === 0 ? (
                      <View style={styles.emptyGroupWrap}>
                        <AppIcon name="box" size={20} color={colors.textTertiary} />
                        <Text style={styles.emptyGroup}>No products in this group.</Text>
                      </View>
                    ) : (
                      items.map(renderProductRow)
                    )}
                  </View>
                </View>
              ))}

              {sections.ungrouped.length > 0 && (
                <View style={styles.groupBlock}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupTitleWrap}>
                      <View style={[styles.groupIconWrap, styles.groupIconWrapMuted]}>
                        <AppIcon name="box" size={18} color={colors.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupName}>Ungrouped</Text>
                        <Text style={styles.groupCount}>
                          {sections.ungrouped.length} {sections.ungrouped.length === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.groupCard}>
                    {sections.ungrouped.map(renderProductRow)}
                  </View>
                </View>
              )}

              {products.length === 0 && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <AppIcon name="box" size={32} color={colors.saffronDark} />
                  </View>
                  <Text style={styles.emptyTitle}>{loadError ? 'Could not load products' : 'No products yet'}</Text>
                  <Text style={styles.emptyText}>
                    {loadError ? 'Pull down to try again.' : 'Add items from your shop menu to manage them here.'}
                  </Text>
                </View>
              )}
              {products.length > 0 && isSearching && filteredProducts.length === 0 && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <AppIcon name="search" size={30} color={colors.saffronDark} />
                  </View>
                  <Text style={styles.emptyTitle}>No matches</Text>
                  <Text style={styles.emptyText}>No products match "{searchQuery.trim()}".</Text>
                </View>
              )}
            </>
          )}
        />
      )}

      {/* New group modal */}
      <Modal visible={newGroupModalOpen} transparent animationType="fade" onRequestClose={() => setNewGroupModalOpen(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setNewGroupModalOpen(false)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <View style={styles.modalIconWrap}>
              <AppIcon name="add" size={22} color={colors.saffronDark} />
            </View>
            <Text style={styles.modalTitle}>New group</Text>
            <Text style={styles.modalSubtitle}>Group products so customers browse them together.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Starters"
              placeholderTextColor={colors.textMuted}
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNewGroupModalOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreateBtn, (!newGroupName.trim() || creatingGroup) && styles.modalCreateDisabled]}
                onPress={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim()}
              >
                <LinearGradient
                  colors={[colors.btnHighlightStart, colors.btnHighlightEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalCreateGradient}
                >
                  <Text style={styles.modalCreateText}>{creatingGroup ? 'Creating…' : 'Create'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group picker for a product */}
      <Modal visible={!!pickerProduct} transparent animationType="fade" onRequestClose={() => setPickerProduct(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerProduct(null)}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <View style={styles.modalIconWrap}>
              <AppIcon name="box" size={22} color={colors.saffronDark} />
            </View>
            <Text style={styles.modalTitle}>Move product</Text>
            <Text style={styles.modalSubtitle}>Choose a group for "{pickerProduct?.name}".</Text>
            <TouchableOpacity style={styles.pickerRow} onPress={() => handleAssignGroup(null)} activeOpacity={0.7}>
              <Text style={styles.pickerRowText}>Ungrouped</Text>
              <AppIcon name="chevronRight" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {groups.map(g => (
              <TouchableOpacity key={g.id} style={styles.pickerRow} onPress={() => handleAssignGroup(g.id)} activeOpacity={0.7}>
                <Text style={styles.pickerRowText}>{g.name}</Text>
                <AppIcon name="chevronRight" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancelBtnWide} onPress={() => setPickerProduct(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.display, fontSize: 26, color: colors.textPrimary },
  newGroupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.saffronLight, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 9, ...shadows.xs,
  },
  newGroupBtnText: { color: colors.saffronDark, fontWeight: '800', fontSize: 13 },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.input, paddingHorizontal: spacing.md, height: 48, ...shadows.sm,
  },
  searchInput: { flex: 1, ...typography.bodyLarge, color: colors.textPrimary, paddingVertical: 0 },
  searchClearBtn: { padding: 2 },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg + spacing.xs, marginBottom: spacing.sm,
  },
  summaryText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  summaryTextBold: { color: colors.textPrimary, fontWeight: '800' },
  summaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.successLight, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  summaryPillText: { color: colors.successDark, fontWeight: '800', fontSize: 12 },
  tabsRow: { marginBottom: spacing.md, flexGrow: 0, height: 44 },
  tabsRowContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSurface,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 9,
  },
  tabChipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  tabChipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  tabChipTextActive: { color: colors.textInverse },
  tabDot: { width: 7, height: 7, borderRadius: radius.circle, backgroundColor: colors.success },
  tabDotOff: { backgroundColor: colors.textTertiary },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  groupBlock: { marginBottom: spacing.lg },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.xs, paddingHorizontal: spacing.xs,
  },
  groupTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  groupIconWrap: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.saffronLight,
    alignItems: 'center', justifyContent: 'center',
  },
  groupIconWrapMuted: { backgroundColor: colors.surfaceMuted },
  groupName: { ...typography.h4, color: colors.textPrimary },
  groupCount: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 1, fontWeight: '500' },
  groupActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupDeleteBtn: { padding: 4 },
  groupCard: {
    backgroundColor: colors.bgSurface, borderRadius: radius.xl, borderWidth: 1,
    borderColor: colors.border, ...shadows.sm,
  },
  emptyGroupWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  emptyGroup: { color: colors.textMuted, ...typography.bodySmall, fontWeight: '500' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowIconWrap: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.saffronLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconWrapMuted: { backgroundColor: colors.surfaceMuted },
  rowNameWrap: { flex: 1 },
  rowName: { ...typography.bodyLarge, color: colors.textPrimary, fontWeight: '600' },
  rowNameOff: { color: colors.textTertiary },
  rowPrice: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600', marginTop: 1 },
  rowPriceOff: { color: colors.textTertiary },
  rowMoveBtn: { padding: 4 },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: radius.circle, backgroundColor: colors.saffronLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: colors.textPrimary },
  emptyText: {
    ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs,
    lineHeight: 20, maxWidth: 260,
  },
  modalOverlay: {
    flex: 1, backgroundColor: colors.overlayDark, justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgSurface, borderRadius: radius.xxl, padding: spacing.xl, ...shadows.lg,
  },
  modalIconWrap: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.saffronLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  modalTitle: { ...typography.h3, color: colors.textPrimary },
  modalSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.input,
    paddingHorizontal: spacing.md, paddingVertical: 12, ...typography.bodyLarge, color: colors.textPrimary,
    backgroundColor: colors.bgApp, marginBottom: spacing.md,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalCancelBtn: { paddingHorizontal: spacing.md, paddingVertical: 10, justifyContent: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  modalCreateBtn: { borderRadius: radius.button, overflow: 'hidden' },
  modalCreateDisabled: { opacity: 0.5 },
  modalCreateGradient: { paddingHorizontal: spacing.lg, paddingVertical: 11, alignItems: 'center' },
  modalCreateText: { color: colors.textInverse, fontWeight: '800', fontSize: 14 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerRowText: { ...typography.bodyLarge, color: colors.textPrimary, fontWeight: '500' },
  modalCancelBtnWide: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
});
