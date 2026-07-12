import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../../theme';
import AdminRidersScreen from './AdminRidersScreen';
import AdminPlaceholderScreen from './AdminPlaceholderScreen';

const SEGMENTS = [
  { key: 'riders', label: 'Riders' },
  { key: 'shops', label: 'Shops' },
  { key: 'customers', label: 'Customers' },
];

/**
 * AdminPeopleScreen — segmented People tab (ADMIN TASK 10-12).
 * Riders is real (TASK 10); Shops/Customers are placeholders until their
 * tasks land.
 */
export default function AdminPeopleScreen() {
  const [segment, setSegment] = useState('riders');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.segmentRow}>
        {SEGMENTS.map((s) => {
          const active = segment === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setSegment(s.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {segment === 'riders' ? <AdminRidersScreen /> : null}
      {segment === 'shops' ? <AdminPlaceholderScreen title="Shops" subtitle="Lands in ADMIN TASK 11." /> : null}
      {segment === 'customers' ? <AdminPlaceholderScreen title="Customers" subtitle="Lands in ADMIN TASK 12." /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  segmentRow: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  segment: {
    flex: 1, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center',
    backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border,
  },
  segmentActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  segmentText: { fontWeight: '700', fontSize: 13, color: colors.textSecondary },
  segmentTextActive: { color: colors.textInverse },
});
