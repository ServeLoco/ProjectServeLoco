import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows, glass, glassRadius, glassShadow } from '../../theme';
import { shopApi, subscribeRealtime } from '../../api';
import { useAuthStore } from '../../stores';
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
  // Scoped to focus: the screen stays mounted behind the other tabs.
  const isScreenFocused = useIsFocused();
  const logout = useAuthStore((s) => s.logout);
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
  const [expandedGroups, setExpandedGroups] = useState(() => new Set()); // group.id | UNGROUPED_KEY, collapsed by default

  // fetchAll (focus effect, socket foreground/reconnect) can race an in-flight
  // toggle/group-move PATCH and overwrite the optimistic local state with the
  // pre-update DB value — these track which rows are mid-mutation so fetchAll
  // keeps the local (already-correct) copy for them instead of clobbering it.
  const productInFlightRef = useRef(new Set());
  const groupInFlightRef = useRef(new Set());
  const variantInFlightRef = useRef(new Set());

  const fetchAll = useCallback(async () => {
    try {
      const [productsRes, groupsRes] = await Promise.all([
        shopApi.getMyProducts(),
        shopApi.getMyGroups(),
      ]);
      setProducts(prev => {
        const fetched = productsRes.products || [];
        const prevById = new Map(prev.map(p => [p.id, p]));
        return fetched.map(p => {
          if (!p) return p;
          if (productInFlightRef.current.has(p.id) && prevById.has(p.id)) {
            return prevById.get(p.id);
          }
          if (variantInFlightRef.current.size === 0 || !Array.isArray(p.variants)) return p;
          const prevProduct = prevById.get(p.id);
          const prevVariantsById = new Map((prevProduct?.variants || []).map(v => [v.id, v]));
          return {
            ...p,
            variants: p.variants.map(v => (
              variantInFlightRef.current.has(`${p.id}:${v.id}`) && prevVariantsById.has(v.id)
                ? prevVariantsById.get(v.id)
                : v
            )),
          };
        });
      });
      setGroups(prev => {
        const fetched = groupsRes.groups || [];
        const prevById = new Map(prev.map(g => [g.id, g]));
        return fetched.map(g => (
          g && groupInFlightRef.current.has(g.id) && prevById.has(g.id)
            ? prevById.get(g.id)
            : g
        ));
      });
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

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Sign out of the shop dashboard?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

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
    productInFlightRef.current.add(product.id);
    setProducts(prev => prev.map(p => (p && p.id === product.id ? { ...p, available: safeValue } : p)));
    try {
      await shopApi.toggleProduct(product.id, safeValue);
    } catch (_) {
      setProducts(prev => prev.map(p => (p && p.id === product.id ? { ...p, available: !safeValue } : p)));
    } finally {
      productInFlightRef.current.delete(product.id);
    }
  }, []);

  const handleVariantToggle = useCallback(async (product, variant, value) => {
    if (!product || product.id == null || !variant || variant.id == null) return;
    const safeValue = Boolean(value);
    const key = `${product.id}:${variant.id}`;
    variantInFlightRef.current.add(key);
    setProducts(prev => prev.map(p => (
      p && p.id === product.id
        ? { ...p, variants: (p.variants || []).map(v => (v.id === variant.id ? { ...v, available: safeValue } : v)) }
        : p
    )));
    try {
      await shopApi.toggleVariant(product.id, variant.id, safeValue);
    } catch (_) {
      setProducts(prev => prev.map(p => (
        p && p.id === product.id
          ? { ...p, variants: (p.variants || []).map(v => (v.id === variant.id ? { ...v, available: !safeValue } : v)) }
          : p
      )));
    } finally {
      variantInFlightRef.current.delete(key);
    }
  }, []);

  const handleGroupToggle = useCallback(async (group, value) => {
    if (!group || group.id == null) return;
    const safeValue = Boolean(value);
    groupInFlightRef.current.add(group.id);
    setGroups(prev => prev.map(g => (g && g.id === group.id ? { ...g, active: safeValue } : g)));
    try {
      await shopApi.updateGroup(group.id, { active: safeValue });
    } catch (_) {
      setGroups(prev => prev.map(g => (g && g.id === group.id ? { ...g, active: !safeValue } : g)));
    } finally {
      groupInFlightRef.current.delete(group.id);
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
    const prevGroupId = product.groupId ?? product.group_id ?? null;
    setPickerProduct(null);
    productInFlightRef.current.add(product.id);
    // Optimistic move — was awaiting the PATCH then a full products+groups
    // refetch before the row moved, costing 2 extra network round-trips
    // (~1-1.5s in production) for something the client already knows.
    setProducts(prev => prev.map(p => (
      p && p.id === product.id ? { ...p, groupId, group_id: groupId } : p
    )));
    try {
      await shopApi.assignProductGroup(product.id, groupId);
    } catch (err) {
      setProducts(prev => prev.map(p => (
        p && p.id === product.id ? { ...p, groupId: prevGroupId, group_id: prevGroupId } : p
      )));
      Alert.alert('Could not move product', err?.message || 'Please try again.');
    } finally {
      productInFlightRef.current.delete(product.id);
    }
  }, [pickerProduct]);

  const handleSearchChange = useCallback((text) => {
    setSearchQuery(text);
    setActiveTab('all'); // typing a search resets any tab filter, matches mockup behavior
  }, []);

  const handleTabPress = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  const toggleGroupExpand = useCallback((key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isSearching = searchQuery.trim().length > 0;
  // Searching, or filtering to a single group via the tab strip, both imply
  // the user wants to see items — don't make them also tap to expand.
  const isGroupExpanded = useCallback(
    (key) => isSearching || (activeTab !== 'all' && activeTab === key) || expandedGroups.has(key),
    [isSearching, activeTab, expandedGroups]
  );

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

  // One flat entry per group header / product / empty-group line, for the
  // virtualized FlatList below.
  //
  // This screen used to render the whole catalog inside a SINGLE FlatList cell
  // (data={[{ key: 'sections' }]}), so nothing was virtualized: every group,
  // every product row and every variant row stayed mounted at once, each with
  // an SVG icon and an Animated toggle. On a shop with a few hundred products
  // that is thousands of live Android views, and the shop tab bar's blur
  // redraws the whole screen once per frame while you scroll — the process ran
  // out of memory and Android killed it, which looked like the app closing by
  // itself with no error. Flat rows let FlatList keep only what is on screen.
  const listRows = useMemo(() => {
    const rows = [];
    const pushBlock = (blockKey, header, items, allowEmpty) => {
      const expanded = isGroupExpanded(blockKey);
      rows.push({ ...header, key: `h:${blockKey}`, expanded });
      if (!expanded) return;
      if (items.length === 0) {
        if (allowEmpty) rows.push({ type: 'emptyGroup', key: `e:${blockKey}` });
        return;
      }
      items.forEach((p, i) => {
        if (!p || p.id == null) return;
        rows.push({
          type: 'product',
          key: `p:${blockKey}:${p.id}`,
          item: p,
          first: i === 0,
          last: i === items.length - 1,
        });
      });
    };

    sections.groupSections.forEach(({ group, items }) => {
      if (!group || group.id == null) return;
      pushBlock(group.id, { type: 'groupHeader', group, count: items.length }, items, true);
    });
    if (sections.ungrouped.length > 0) {
      pushBlock(
        UNGROUPED_KEY,
        { type: 'ungroupedHeader', count: sections.ungrouped.length },
        sections.ungrouped,
        false
      );
    }
    // The gap that used to sit under each group block now belongs to whichever
    // row ends that block.
    for (let i = 0; i < rows.length; i += 1) {
      const next = rows[i + 1];
      rows[i].blockLast = !next || next.type === 'groupHeader' || next.type === 'ungroupedHeader';
    }
    return rows;
  }, [sections, isGroupExpanded]);

  const renderProductRow = (item, isLast) => {
    if (!item || item.id == null) return null;
    const isAvailable = Boolean(item.available);
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const hasVariants = variants.length > 0;
    const initial = (item.name || '?').trim().charAt(0).toUpperCase() || '?';
    // Shop owners see what they are paid (shop_price), never the customer price.
    const shopPrice = item.shopPrice ?? item.shop_price;
    const meta = [shopPrice != null ? `₹${shopPrice}` : null, item.unit || null].filter(Boolean).join(' · ');
    return (
      <View key={item.id}>
        <View style={[styles.row, isLast && !hasVariants && styles.rowLast]}>
          <View style={[styles.rowAvatar, !isAvailable && styles.rowAvatarOff]}>
            <Text style={[styles.rowAvatarText, !isAvailable && styles.rowAvatarTextOff]}>{initial}</Text>
          </View>
          <View style={styles.rowNameWrap}>
            <Text style={[styles.rowName, !isAvailable && styles.rowNameOff]} numberOfLines={1}>{item.name || 'Unnamed product'}</Text>
            {!!(meta || hasVariants) && (
              <Text style={styles.rowMetaText} numberOfLines={1}>
                {[meta, hasVariants ? `${variants.length} option${variants.length === 1 ? '' : 's'}` : null]
                  .filter(Boolean)
                  .join('  •  ')}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.rowMoveBtn}
            onPress={() => setPickerProduct(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Move to group"
          >
            <AppIcon name="pencil" size={15} color="#FFFFFF" />
          </TouchableOpacity>
          <ShopToggle
            value={isAvailable}
            onValueChange={(v) => handleProductToggle(item, v)}
            activeColor={colors.success}
            size="md"
          />
        </View>
        {hasVariants && (
          <View style={[styles.variantGroup, isLast && styles.rowLast]}>
            {variants.map((v, vIdx) => {
              const vShopPrice = v.shopPrice ?? v.shop_price;
              return (
              <View
                key={v.id}
                style={[
                  styles.variantRow,
                  vIdx === 0 && styles.variantRowFirst,
                  vIdx === variants.length - 1 && styles.variantRowLast,
                ]}
              >
                <View style={[styles.variantDot, !v.available && styles.variantDotOff]} />
                <Text style={[styles.variantName, !v.available && styles.rowNameOff]} numberOfLines={1}>
                  {v.label || 'Option'}
                </Text>
                {vShopPrice != null && (
                  <Text style={[styles.variantPrice, !v.available && styles.rowNameOff]}>₹{vShopPrice}</Text>
                )}
                <ShopToggle
                  value={Boolean(v.available)}
                  onValueChange={(val) => handleVariantToggle(item, v, val)}
                  activeColor={colors.success}
                  size="sm"
                />
              </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // Group headers keep their own BlurView (one per group, a bounded number).
  // Product rows are plain Views carrying the card's left/right border, so the
  // block still reads as one rounded card without a blur view per row.
  const renderListRow = ({ item: row }) => {
    if (row.type === 'product') {
      return (
        <View
          style={[
            styles.cardSeg,
            row.first && styles.cardSegFirst,
            row.last && styles.cardSegLast,
            row.blockLast && styles.blockGap,
          ]}
        >
          {renderProductRow(row.item, row.last)}
        </View>
      );
    }

    if (row.type === 'emptyGroup') {
      return (
        <View
          style={[
            styles.cardSeg, styles.cardSegFirst, styles.cardSegLast,
            row.blockLast && styles.blockGap,
          ]}
        >
          <View style={styles.emptyGroupWrap}>
            <AppIcon name="box" size={20} color="rgba(255,255,255,0.5)" />
            <Text style={styles.emptyGroup}>No products in this group.</Text>
          </View>
        </View>
      );
    }

    if (row.type === 'ungroupedHeader') {
      return (
        <BlurView
          key={`header-${row.expanded}`}
          intensity={32}
          tint="dark"
          style={[
            styles.groupHeader,
            row.expanded && styles.groupHeaderExpanded,
            row.blockLast && styles.blockGap,
          ]}
        >
          <TouchableOpacity
            style={styles.groupTitleWrap}
            onPress={() => toggleGroupExpand(UNGROUPED_KEY)}
            activeOpacity={0.7}
          >
            <View style={[styles.groupIconWrap, styles.groupIconWrapMuted]}>
              <AppIcon name="box" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>Ungrouped</Text>
              <Text style={styles.groupCount}>
                {row.count} {row.count === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <AppIcon name={row.expanded ? 'down' : 'chevronRight'} size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </BlurView>
      );
    }

    const group = row.group;
    return (
      <BlurView
        key={`header-${row.expanded}`}
        intensity={32}
        tint="dark"
        style={[
          styles.groupHeader,
          row.expanded && styles.groupHeaderExpanded,
          row.blockLast && styles.blockGap,
        ]}
      >
        <TouchableOpacity
          style={styles.groupTitleWrap}
          onPress={() => toggleGroupExpand(group.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.groupIconWrap, !group.active && styles.groupIconWrapMuted]}>
            <AppIcon name="shoppingBag" size={18} color={group.active ? '#FFFFFF' : 'rgba(255,255,255,0.5)'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupCount}>
              {row.count} {row.count === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <AppIcon name={row.expanded ? 'down' : 'chevronRight'} size={16} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.groupActions}>
          <TouchableOpacity
            style={styles.groupDeleteBtn}
            onPress={() => handleDeleteGroup(group)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppIcon name="delete" size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <ShopToggle
            value={Boolean(group.active)}
            onValueChange={(v) => handleGroupToggle(group, v)}
            activeColor={colors.success}
            size="md"
          />
        </View>
      </BlurView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {isScreenFocused && <StatusBar barStyle="light-content" backgroundColor="transparent" />}
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.newGroupBtn} onPress={() => setNewGroupModalOpen(true)} activeOpacity={0.8}>
            <AppIcon name="add" size={16} color={colors.textInverse} />
            <Text style={styles.newGroupBtnText}>New Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <AppIcon name="logout" size={20} color={glass.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <BlurView intensity={28} tint="dark" style={styles.searchBox}>
          <AppIcon name="search" size={18} color={colors.saffron} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products"
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {isSearching && (
              <TouchableOpacity style={styles.searchClearBtn} onPress={() => handleSearchChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <AppIcon name="close" size={16} color="#FFFFFF" />
              </TouchableOpacity>
          )}
        </BlurView>
      </View>

      {products.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryTextBold}>{totalCount}</Text> products
          </Text>
          <View style={styles.summaryPill}>
            <AppIcon name="check" size={12} color="#FFFFFF" />
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
          data={listRows}
          keyExtractor={(row) => row.key}
          renderItem={renderListRow}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
          ListEmptyComponent={
            products.length === 0 ? (
              <BlurView intensity={30} tint="dark" style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <AppIcon name="box" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.emptyTitle}>{loadError ? 'Could not load products' : 'No products yet'}</Text>
                <Text style={styles.emptyText}>
                  {loadError ? 'Pull down to try again.' : 'Add items from your shop menu to manage them here.'}
                </Text>
              </BlurView>
            ) : isSearching && filteredProducts.length === 0 ? (
              <BlurView intensity={30} tint="dark" style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <AppIcon name="search" size={30} color="#FFFFFF" />
                </View>
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyText}>No products match "{searchQuery.trim()}".</Text>
              </BlurView>
            ) : null
          }
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
              <AppIcon name="add" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.modalTitle}>New group</Text>
            <Text style={styles.modalSubtitle}>Group products so customers browse them together.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Starters"
              placeholderTextColor={glass.textFaint}
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
              <AppIcon name="box" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.modalTitle}>Move product</Text>
            <Text style={styles.modalSubtitle}>Choose a group for "{pickerProduct?.name}".</Text>
            <TouchableOpacity style={styles.pickerRow} onPress={() => handleAssignGroup(null)} activeOpacity={0.7}>
              <Text style={styles.pickerRowText}>Ungrouped</Text>
              <AppIcon name="chevronRight" size={18} color={glass.textDim} />
            </TouchableOpacity>
            {groups.map(g => (
              <TouchableOpacity key={g.id} style={styles.pickerRow} onPress={() => handleAssignGroup(g.id)} activeOpacity={0.7}>
                <Text style={styles.pickerRowText}>{g.name}</Text>
                <AppIcon name="chevronRight" size={18} color={glass.textDim} />
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
  container: { flex: 1, backgroundColor: glass.screen },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  title: { ...typography.display, fontSize: 26, color: glass.text },
  newGroupBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.saffron, borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2, paddingVertical: 10,
  },
  newGroupBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 13 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoutBtn: {
    width: 44, height: 44, borderRadius: radius.circle, backgroundColor: glass.fillStrong,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: glass.border,
    ...glassShadow,
  },

  searchWrap: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 50,
    overflow: 'hidden', ...glassShadow,
  },
  searchInput: { flex: 1, ...typography.bodyLarge, color: '#FFFFFF', paddingVertical: 0 },
  searchClearBtn: { padding: 2 },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md + spacing.xs, marginBottom: spacing.sm,
  },
  summaryText: { ...typography.bodySmall, color: glass.textDim, fontWeight: '600' },
  summaryTextBold: { color: glass.text, fontWeight: '800' },
  summaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0C6B43', borderRadius: radius.pill,
    paddingHorizontal: 11, paddingVertical: 5,
  },
  summaryPillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  /* Fixed height: the horizontal ScrollView clips its content, and letting it
   * self-measure sliced the descenders off the chip labels. */
  /* Fixed height: the horizontal ScrollView clips its content, and letting it
   * self-measure sliced the chip labels. Radius is exactly half that height so
   * the chips are true stadiums — radius.pill (100) gets clamped by Android and
   * came out as a rounded box. */
  tabsRow: { marginBottom: spacing.md, flexGrow: 0, height: 50 },
  tabsRowContent: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 38, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 19, paddingHorizontal: spacing.md,
  },
  tabChipActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  tabChipText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: 'rgba(255,255,255,0.72)' },
  tabChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  tabDot: { width: 7, height: 7, borderRadius: radius.circle, backgroundColor: '#2FD892' },
  tabDotOff: { backgroundColor: 'rgba(255,255,255,0.45)' },

  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl + spacing.xxl },
  blockGap: { marginBottom: spacing.md },

  /* One slice of the group card, drawn per product row. The old card was a
   * BlurView (intensity 22, tint dark) with an rgba(255,255,255,0.05) fill on
   * top; on Android that blur is a flat rgba(25,25,25,0.149) tint, so the two
   * layers composite to the single colour below and the card looks unchanged. */
  cardSeg: {
    backgroundColor: 'rgba(85,85,85,0.19)',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 6,
  },
  cardSegFirst: { paddingTop: 6 },
  cardSegLast: {
    paddingBottom: 6, borderBottomWidth: 1,
    borderBottomLeftRadius: glassRadius.card, borderBottomRightRadius: glassRadius.card,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    borderTopColor: 'rgba(255,255,255,0.34)',
    borderRadius: glassRadius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    overflow: 'hidden', ...glassShadow,
  },
  groupHeaderExpanded: {
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0,
  },
  groupTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  groupIconWrap: {
    width: 40, height: 40, borderRadius: glassRadius.inner - 4, backgroundColor: colors.saffron,
    alignItems: 'center', justifyContent: 'center',
  },
  groupIconWrapMuted: { backgroundColor: '#4A4A54' },
  groupName: { ...typography.h4, color: '#FFFFFF' },
  groupCount: { ...typography.bodySmall, color: 'rgba(255,255,255,0.70)', marginTop: 1, fontWeight: '600' },
  groupActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupDeleteBtn: {
    width: 30, height: 30, borderRadius: radius.circle, backgroundColor: '#B3211F',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyGroupWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  emptyGroup: { color: 'rgba(255,255,255,0.55)', ...typography.bodySmall, fontWeight: '500' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: glassRadius.inner, marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  rowLast: { marginBottom: 0 },
  rowAvatar: {
    width: 34, height: 34, borderRadius: radius.lg, backgroundColor: colors.saffron,
    alignItems: 'center', justifyContent: 'center',
  },
  rowAvatarOff: { backgroundColor: '#4A4A54' },
  rowAvatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  rowAvatarTextOff: { color: 'rgba(255,255,255,0.5)' },
  rowNameWrap: { flex: 1 },
  rowName: { ...typography.bodyLarge, color: '#FFFFFF', fontWeight: '600' },
  rowNameOff: { color: 'rgba(255,255,255,0.42)' },
  rowMetaText: {
    ...typography.bodySmall, color: 'rgba(255,255,255,0.62)', fontSize: 12, marginTop: 1,
    fontWeight: '600', fontVariant: ['tabular-nums'],
  },

  variantGroup: {
    backgroundColor: 'rgba(0,0,0,0.26)', paddingLeft: spacing.md + 34 + spacing.sm,
    borderRadius: glassRadius.inner, marginBottom: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  variantRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, paddingRight: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
  },
  variantRowFirst: { borderTopWidth: 0 },
  variantRowLast: { paddingBottom: 10 },
  variantDot: { width: 6, height: 6, borderRadius: radius.circle, backgroundColor: colors.saffron },
  variantDotOff: { backgroundColor: 'rgba(255,255,255,0.35)' },
  variantName: { ...typography.bodySmall, color: 'rgba(255,255,255,0.88)', fontWeight: '600', flex: 1 },
  variantPrice: {
    ...typography.bodySmall, color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowMoveBtn: {
    width: 32, height: 32, borderRadius: radius.circle,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center', justifyContent: 'center',
  },

  emptyState: {
    alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl,
    marginTop: spacing.lg, borderRadius: glassRadius.card, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    borderTopColor: 'rgba(255,255,255,0.34)',
    ...glassShadow,
  },
  emptyIconWrap: {
    width: 76, height: 76, borderRadius: radius.circle, backgroundColor: colors.saffron,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: glass.text },
  emptyText: {
    ...typography.body, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: spacing.xs,
    lineHeight: 20, maxWidth: 260,
  },

  /* Modals — dark glass sheets */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: '#121212', borderRadius: glassRadius.hero, padding: spacing.xl,
    borderWidth: 1, borderColor: glass.border, ...shadows.lg,
  },
  modalIconWrap: {
    width: 48, height: 48, borderRadius: glassRadius.inner, backgroundColor: '#FF7A3A',
    borderWidth: 1, borderColor: '#E05A1A',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  modalTitle: { ...typography.h3, color: glass.text },
  modalSubtitle: { ...typography.bodySmall, color: glass.textDim, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  modalInput: {
    borderWidth: 1, borderColor: glass.border, borderRadius: glassRadius.inner,
    paddingHorizontal: spacing.md, paddingVertical: 12, ...typography.bodyLarge, color: glass.text,
    backgroundColor: glass.fill, marginBottom: spacing.md,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalCancelBtn: { paddingHorizontal: spacing.md, paddingVertical: 10, justifyContent: 'center' },
  modalCancelText: { color: glass.textDim, fontWeight: '700', fontSize: 14 },
  modalCreateBtn: { borderRadius: radius.pill, overflow: 'hidden' },
  modalCreateDisabled: { opacity: 0.5 },
  modalCreateGradient: { paddingHorizontal: spacing.lg, paddingVertical: 12, alignItems: 'center' },
  modalCreateText: { color: colors.textInverse, fontWeight: '800', fontSize: 14 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: spacing.xs, borderBottomWidth: 1, borderBottomColor: glass.divider,
  },
  pickerRowText: { ...typography.bodyLarge, color: glass.text, fontWeight: '500' },
  modalCancelBtnWide: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
});
