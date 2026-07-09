import React, { useState, useCallback } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../theme';
import { useAuthStore } from '../../stores';
import { shopApi } from '../../api';

/**
 * ShopHomeScreen
 * Shop name + a single large open/closed switch (optimistic with rollback).
 * Includes the standard logout affordance so an owner can sign out.
 */
export default function ShopHomeScreen() {
  const shop = useAuthStore((s) => s.shop);
  const logout = useAuthStore((s) => s.logout);
  const [isOpen, setIsOpen] = useState(Boolean(shop?.isOpen));
  const [busy, setBusy] = useState(false);

  const handleToggle = useCallback(async (value) => {
    const prev = isOpen;
    setIsOpen(value); // optimistic
    setBusy(true);
    try {
      await shopApi.toggleShop(value);
    } catch (err) {
      setIsOpen(prev); // rollback
      Alert.alert('Could not update shop', err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [isOpen]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Sign out of the shop dashboard?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{shop?.name || 'My Shop'}</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Shop status</Text>
            <Text style={styles.cardSubtitle}>
              {isOpen ? 'Open — products visible to customers' : 'Closed — products hidden from customers'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={handleToggle}
            disabled={busy}
            trackColor={{ false: colors.grey100, true: colors.success }}
            thumbColor={colors.white}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { ...typography.heading, fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  logoutText: { color: colors.error, fontWeight: '600', fontSize: 14 },
  card: {
    backgroundColor: colors.bgCard, borderRadius: 16, margin: spacing.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  cardSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
});
