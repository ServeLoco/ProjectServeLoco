import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Switch, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography } from '../../theme';
import { shopApi } from '../../api';

/**
 * ShopProductsScreen
 * Lists this shop's products with an availability toggle per row.
 */
export default function ShopProductsScreen() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await shopApi.getMyProducts();
      setProducts(res.products || []);
    } catch (_) {
      // keep last list on transient error
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  const handleToggle = useCallback(async (product, value) => {
    // Optimistic: flip local state immediately.
    setProducts(prev =>
      prev.map(p => (p.id === product.id ? { ...p, available: value } : p))
    );
    try {
      await shopApi.toggleProduct(product.id, value);
    } catch (_) {
      // Rollback on error.
      setProducts(prev =>
        prev.map(p => (p.id === product.id ? { ...p, available: !value } : p))
      );
    }
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
      <Switch
        value={Boolean(item.available)}
        onValueChange={(v) => handleToggle(item, v)}
        trackColor={{ false: colors.grey100, true: colors.success }}
        thumbColor={colors.white}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Products</Text>
      {loading && products.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          ListEmptyComponent={<Text style={styles.empty}>No products assigned to your shop.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  title: { ...typography.heading, fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, backgroundColor: colors.bgCard },
  rowName: { flex: 1, fontSize: 16, color: colors.textPrimary, marginRight: 12 },
  separator: { height: 1, backgroundColor: colors.border },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40, fontSize: 15 },
});
