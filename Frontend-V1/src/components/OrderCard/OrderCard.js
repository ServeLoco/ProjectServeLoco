import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../../theme';

const STATUS_COLORS = {
  Pending:          { bg: '#FFF8EE', text: '#F07C00' },
  Preparing:        { bg: '#EFF6FF', text: '#2563EB' },
  'Out for Delivery': { bg: '#EDFAF4', text: '#1AA362' },
  Delivered:        { bg: '#EDFAF4', text: '#1AA362' },
  Cancelled:        { bg: '#FFF2F2', text: '#DC2626' },
};

const PAYMENT_COLORS = {
  Pending: colors.warning,
  Paid:    colors.success,
  Failed:  colors.error,
};

/**
 * OrderCard
 * Customer order list card.
 *
 * Props:
 *   order        - { id, orderNumber, status, paymentStatus, itemCount, total, createdAt, items }
 *   onViewDetails - tap "View Details"
 *   onCancel     - tap "Cancel" (shown only when cancellable prop is true)
 *   cancellable  - shows cancel button
 *   style        - container style
 */
function OrderCard({ order = {}, onViewDetails, onCancel, cancellable = false, style }) {
  const {
    orderNumber,
    status = 'Pending',
    paymentStatus = 'Pending',
    itemCount = 0,
    total = 0,
    createdAt,
  } = order;

  const statusColor = STATUS_COLORS[status] || { bg: colors.bgDisabled, text: colors.textSecondary };

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';

  return (
    <View style={[styles.card, style]}>
      {/* Top row */}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.orderNum}>#{orderNumber || order.id}</Text>
          {formattedDate ? (
            <Text style={styles.date}>{formattedDate}</Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusText, { color: statusColor.text }]}>
            {status}
          </Text>
        </View>
      </View>

      {/* Mid row */}
      <View style={styles.midRow}>
        <Text style={styles.itemCount}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
        <View style={styles.paymentRow}>
          <View style={[styles.payDot, { backgroundColor: PAYMENT_COLORS[paymentStatus] || colors.textSecondary }]} />
          <Text style={styles.paymentText}>{paymentStatus}</Text>
        </View>
      </View>

      {/* Total */}
      <Text style={styles.total}>Rs. {Number(total).toFixed(0)}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onViewDetails}
          style={styles.viewBtn}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="View order details"
        >
          <Text style={styles.viewBtnText}>View Details</Text>
        </TouchableOpacity>

        {cancellable ? (
          <TouchableOpacity
            onPress={onCancel}
            style={styles.cancelBtn}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Cancel order"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    ...shadows.card,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNum: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  date: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusText: {
    ...typography.captionMedium,
    fontWeight: '600',
  },
  midRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  payDot: {
    width: 7,
    height: 7,
    borderRadius: radius.circle,
  },
  paymentText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  total: {
    ...typography.price,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  viewBtn: {
    flex: 1,
    height: 38,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnText: {
    ...typography.button,
    color: colors.primary,
  },
  cancelBtn: {
    flex: 1,
    height: 38,
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    ...typography.button,
    color: colors.error,
  },
});

export default OrderCard;
