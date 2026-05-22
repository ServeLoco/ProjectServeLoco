import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';

/**
 * AdminMetricCard
 * Dashboard metric card showing a label and a value.
 *
 * Props:
 *   label    - metric name e.g. "Today Orders"
 *   value    - displayed metric value string or number
 *   accent   - optional accent color for the value text
 *   icon     - optional ReactNode shown top-right
 *   style    - container style
 */
function AdminMetricCard({ label, value, accent, icon, style }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      </View>
      <Text
        style={[styles.value, accent && { color: accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value ?? '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    minHeight: layout.metricCardMinHeight,
    justifyContent: 'space-between',
    ...shadows.xs,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    marginLeft: spacing.sm,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  value: {
    ...typography.h2,
    color: colors.textPrimary,
  },
});

export default AdminMetricCard;
