import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../theme';

// Shared shell for admin tabs not yet built out (ADMIN TASK 7 — screens land
// in later tasks: 8 Dashboard, 9 Orders, 10-12 Riders/Shops/Customers,
// 13 Notifications, 14 Analytics).
export default function AdminPlaceholderScreen({ title, subtitle }) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle || 'Coming soon.'}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
