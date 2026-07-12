import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { adminApi, subscribeAdminRealtime, subscribeAdminRealtimeLifecycle } from '../../api';
import AppIcon from '../../components/AppIcon';

/**
 * AdminRidersScreen (ADMIN TASK 10) — mirrors apps/admin Riders.jsx: list
 * with online/heartbeat/active state, create by phone (must already have an
 * account), toggle active, live admin.rider.updated merge.
 */
export default function AdminRidersScreen() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchRiders = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await adminApi.listRiders();
      setRiders(res?.riders || []);
    } catch (err) {
      setError(err?.message || 'Could not load riders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchRiders({ silent: true }); }, [fetchRiders]));

  useEffect(() => {
    const unsubRider = subscribeAdminRealtime('admin.rider.updated', (payload) => {
      if (!payload?.id) return;
      setRiders((prev) => {
        const idx = prev.findIndex((r) => Number(r.id) === Number(payload.id));
        if (idx < 0) return [...prev, payload];
        const next = [...prev];
        next[idx] = { ...next[idx], ...payload };
        return next;
      });
    });
    const unsubLifecycle = subscribeAdminRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'foreground') fetchRiders({ silent: true });
    });
    return () => {
      unsubRider();
      unsubLifecycle();
    };
  }, [fetchRiders]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRiders({ silent: true });
  }, [fetchRiders]);

  const openCreate = () => {
    setPhone('');
    setDisplayName('');
    setFormError(null);
    setDrawerOpen(true);
  };

  const submitCreate = async () => {
    try {
      setSaving(true);
      setFormError(null);
      await adminApi.createRider({ phone: phone.trim(), displayName: displayName.trim() || undefined });
      setDrawerOpen(false);
      fetchRiders({ silent: true });
    } catch (err) {
      setFormError(err?.message || 'Could not create rider.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rider) => {
    try {
      setError(null);
      await adminApi.updateRider(rider.id, { active: !rider.active });
      fetchRiders({ silent: true });
    } catch (err) {
      setError(err?.message || 'Could not update rider.');
    }
  };

  const renderRider = ({ item }) => {
    const isOnline = Boolean(item.isOnline ?? item.is_online);
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.displayName || item.display_name}</Text>
          <Text style={styles.meta}>{item.phone || item.userPhone || item.user_phone || '—'}</Text>
          <View style={styles.onlineRow}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.success : colors.textTertiary }]} />
            <Text style={styles.onlineText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.toggle, item.active ? styles.toggleOn : styles.toggleOff]}
          onPress={() => toggleActive(item)}
        >
          <Text style={[styles.toggleText, item.active ? styles.toggleOnText : styles.toggleOffText]}>
            {item.active ? 'Active' : 'Inactive'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Delivery partners — one phone is rider or shop owner, never both.</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
          <AppIcon name="add" size={16} color={colors.textInverse} />
          <Text style={styles.addBtnText}>New Rider</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={riders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRider}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.saffron} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No riders yet. Create one with a customer phone number.</Text>
            </View>
          )
        }
      />

      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setDrawerOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Create rider</Text>
            {formError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}
            <Text style={styles.fieldLabel}>Customer phone *</Text>
            <TextInput
              style={styles.input}
              placeholder="Must already exist (OTP login once)"
              placeholderTextColor={colors.textTertiary}
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional — defaults to user name"
              placeholderTextColor={colors.textTertiary}
              value={displayName}
              onChangeText={setDisplayName}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={submitCreate} disabled={saving || !phone.trim()}>
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveBtnText}>Create rider</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.saffron, borderRadius: radius.button, paddingVertical: spacing.sm,
  },
  addBtnText: { color: colors.textInverse, fontWeight: '800', fontSize: 14 },
  errorBanner: { marginHorizontal: spacing.lg, backgroundColor: colors.errorLight, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.sm },
  errorText: { color: colors.error, fontWeight: '600', fontSize: 13 },
  listContent: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSurface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    ...shadows.sm,
  },
  name: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: radius.circle },
  onlineText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  toggle: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  toggleOn: { backgroundColor: colors.successLight },
  toggleOff: { backgroundColor: colors.bgApp, borderWidth: 1, borderColor: colors.border },
  toggleText: { fontWeight: '800', fontSize: 12 },
  toggleOnText: { color: colors.successDark },
  toggleOffText: { color: colors.textSecondary },
  emptyState: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.xl },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlayDark },
  sheet: { backgroundColor: colors.bgSurface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.lg, paddingBottom: spacing.xl },
  sheetTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: spacing.md, color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.saffron, borderRadius: radius.button, paddingVertical: spacing.sm, alignItems: 'center' },
  saveBtnText: { color: colors.textInverse, fontWeight: '800' },
});
