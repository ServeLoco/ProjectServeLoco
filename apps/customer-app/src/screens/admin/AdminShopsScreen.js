import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { adminApi, subscribeAdminRealtimeLifecycle } from '../../api';
import AppIcon from '../../components/AppIcon';

/**
 * AdminShopsScreen (ADMIN TASK 11) — mirrors apps/admin Shops.jsx: list with
 * owner/product count/active/open, create/edit by owner phone, toggle
 * is_open/active with a confirm on the closing/deactivating direction only
 * (matches the Dashboard delivery-toggle precedent — phone taps are easier
 * to mis-hit than a desktop click). No product assignment on phone (11.4).
 */
export default function AdminShopsScreen() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingShop, setEditingShop] = useState(null);
  const [name, setName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchShops = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await adminApi.listShops();
      setShops(res?.shops || []);
    } catch (err) {
      setError(err?.message || 'Could not load shops.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchShops({ silent: true }); }, [fetchShops]));

  useEffect(() => {
    const unsub = subscribeAdminRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') fetchShops({ silent: true });
    });
    return unsub;
  }, [fetchShops]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchShops({ silent: true });
  }, [fetchShops]);

  const openCreate = () => {
    setEditingShop(null);
    setName('');
    setOwnerPhone('');
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (shop) => {
    setEditingShop(shop);
    setName(shop.name || '');
    setOwnerPhone(shop.owner_phone || '');
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    try {
      setSaving(true);
      setFormError(null);
      if (editingShop) {
        // PATCH only updates fields present — always send owner_phone on
        // edit since blank meaningfully clears the owner (matches web).
        await adminApi.updateShop(editingShop.id, { name, owner_phone: ownerPhone.trim() || null });
      } else {
        const payload = { name };
        if (ownerPhone.trim()) payload.owner_phone = ownerPhone.trim();
        await adminApi.createShop(payload);
      }
      setDrawerOpen(false);
      fetchShops({ silent: true });
    } catch (err) {
      setFormError(err?.message || 'Could not save shop.');
    } finally {
      setSaving(false);
    }
  };

  const applyToggle = async (shop, field, nextValue) => {
    try {
      setError(null);
      await adminApi.updateShop(shop.id, { [field]: nextValue });
      fetchShops({ silent: true });
    } catch (err) {
      setError(err?.message || 'Could not update shop.');
    }
  };

  const toggleActive = (shop) => {
    const next = !shop.active;
    if (!next) {
      Alert.alert('Deactivate shop?', `${shop.name} will stop accepting orders.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: () => applyToggle(shop, 'active', false) },
      ]);
      return;
    }
    applyToggle(shop, 'active', true);
  };

  const toggleOpen = (shop) => {
    const next = !shop.is_open;
    if (!next) {
      Alert.alert('Close shop?', `${shop.name} will stop taking new orders until reopened.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close', style: 'destructive', onPress: () => applyToggle(shop, 'is_open', false) },
      ]);
      return;
    }
    applyToggle(shop, 'is_open', true);
  };

  const renderShop = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.owner_user_id ? `${item.owner_name || 'Unnamed'} (${item.owner_phone})` : '— unassigned —'}
        </Text>
        <Text style={styles.meta}>{item.product_count ?? 0} products</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
        <TouchableOpacity style={[styles.toggle, item.active ? styles.toggleOn : styles.toggleOff]} onPress={() => toggleActive(item)}>
          <Text style={[styles.toggleText, item.active ? styles.toggleOnText : styles.toggleOffText]}>{item.active ? 'Active' : 'Inactive'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggle, item.is_open ? styles.toggleOn : styles.toggleOff]} onPress={() => toggleOpen(item)}>
          <Text style={[styles.toggleText, item.is_open ? styles.toggleOnText : styles.toggleOffText]}>{item.is_open ? 'Open' : 'Closed'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openEdit(item)}>
          <Text style={styles.editLink}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <AppIcon name="add" size={16} color={colors.textInverse} />
          <Text style={styles.addBtnText}>New Shop</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={shops}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderShop}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No shops found.</Text>
            </View>
          )
        }
      />

      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setDrawerOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{editingShop ? 'Edit shop' : 'New shop'}</Text>
            {formError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}
            <Text style={styles.fieldLabel}>Shop name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.textTertiary} />
            <Text style={styles.fieldLabel}>Owner phone (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="+919876543210"
              placeholderTextColor={colors.textTertiary}
              value={ownerPhone}
              onChangeText={setOwnerPhone}
            />
            <Text style={styles.hint}>
              The owner must have logged into the app via OTP at least once before you can assign them here.
              {editingShop ? ' Clear this field to remove the current owner.' : ''}
            </Text>
            <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={saving || !name.trim()}>
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveBtnText}>{editingShop ? 'Save changes' : 'Create shop'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.saffron, borderRadius: radius.button, paddingVertical: spacing.sm,
  },
  addBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 14 },
  errorBanner: { marginHorizontal: spacing.lg, backgroundColor: colors.errorLight, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.sm },
  errorText: { color: colors.error, fontWeight: '600', fontSize: 13 },
  listContent: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row', backgroundColor: colors.bgSurface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    ...shadows.sm,
  },
  name: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  toggle: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, minWidth: 76, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.successLight },
  toggleOff: { backgroundColor: colors.bgApp, borderWidth: 1, borderColor: colors.border },
  toggleText: { fontWeight: '800', fontSize: 11 },
  toggleOnText: { color: colors.successDark },
  toggleOffText: { color: colors.textSecondary },
  editLink: { fontSize: 12, fontWeight: '700', color: colors.saffronDark },
  emptyState: { alignItems: 'center', paddingTop: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlayDark },
  sheet: { backgroundColor: colors.bgSurface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.lg, paddingBottom: spacing.xl },
  sheetTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.sm, color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textTertiary, marginBottom: spacing.md },
  saveBtn: { backgroundColor: colors.saffron, borderRadius: radius.button, paddingVertical: spacing.sm, alignItems: 'center' },
  saveBtnText: { color: colors.textInverse, fontWeight: '800' },
});
