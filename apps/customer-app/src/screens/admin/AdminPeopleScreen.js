import { adminUi } from '../../theme/adminUi';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../theme';
import AdminRidersScreen from './AdminRidersScreen';
import AdminShopsScreen from './AdminShopsScreen';
import AdminCustomersScreen from './AdminCustomersScreen';

const SEGMENTS = [
  { key: 'riders', label: 'Riders' },
  { key: 'shops', label: 'Shops' },
  { key: 'customers', label: 'Customers' },
];

/**
 * AdminPeopleScreen — segmented People tab (ADMIN TASK 10-12: Riders/Shops/Customers).
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
      {segment === 'shops' ? <AdminShopsScreen /> : null}
      {segment === 'customers' ? <AdminCustomersScreen /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminUi.canvas },
  segmentRow: {
    flexDirection: 'row', gap: 4, marginHorizontal: adminUi.gutter,
    marginTop: spacing.md, marginBottom: spacing.sm, padding: 4,
    borderRadius: 16, backgroundColor: adminUi.soft,
  },
  segment: {
    flex: 1, minWidth: 0, borderRadius: adminUi.controlRadius, paddingVertical: 11, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  segmentActive: { backgroundColor: adminUi.surface, ...adminUi.shadow },
  segmentText: { fontWeight: '700', fontSize: 13, color: adminUi.muted },
  segmentTextActive: { color: adminUi.text },
});
