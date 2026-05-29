import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius, borderWidth } from '../../theme';

/**
 * BillSummary
 * Displays cart/order bill breakdown.
 *
 * Props:
 *   subtotal          - number
 *   deliveryCharge    - number
 *   nightCharge       - number (0 or undefined = not shown)
 *   discount          - number (0 or undefined = not shown)
 *   total             - number (grand total)
 *   minimumOrder      - number (shows warning if subtotal < minimumOrder)
 *   style             - container style
 */
function BillSummary({
  subtotal = 0,
  deliveryCharge = 0,
  nightCharge = 0,
  discount = 0,
  total = 0,
  minimumOrder,
  belowThreshold = false,
  style,
}) {
  const showNight = nightCharge > 0;
  const showDiscount = discount > 0;
  const belowMin = minimumOrder && subtotal < minimumOrder && subtotal > 0;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.heading}>Bill Summary</Text>

      <BillRow label="Subtotal" value={`₹${subtotal.toFixed(0)}`} />
      <BillRow label={belowThreshold ? 'Delivery Charge (Below Minimum)' : 'Delivery Charge'} value={deliveryCharge === 0 ? 'Free' : `₹${deliveryCharge.toFixed(0)}`} />
      {showNight ? (
        <BillRow label="Night Charge" value={`₹${nightCharge.toFixed(0)}`} warn />
      ) : null}
      {showDiscount ? (
        <BillRow label="Discount" value={`- ₹${discount.toFixed(0)}`} success />
      ) : null}

      <View style={styles.divider} />

      <BillRow label="Grand Total" value={`₹${total.toFixed(0)}`} total />

      {belowMin ? (
        <View style={styles.minOrderWarn}>
          <Text style={styles.minOrderText}>
            Minimum order is ₹{minimumOrder}. Add items worth ₹{' '}
            {(minimumOrder - subtotal).toFixed(0)} more.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function BillRow({ label, value, total: isTotal = false, warn = false, success = false }) {
  const valueColor = warn
    ? colors.warning
    : success
    ? colors.success
    : isTotal
    ? colors.textPrimary
    : colors.textSecondary;

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, isTotal && styles.totalLabel]}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: valueColor }, isTotal && styles.totalValue]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    gap: spacing.sm,
  },
  heading: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  rowValue: {
    ...typography.label,
    color: colors.textSecondary,
  },
  totalLabel: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  totalValue: {
    ...typography.priceLarge,
    color: colors.textPrimary,
  },
  divider: {
    height: borderWidth.thin,
    backgroundColor: colors.divider,
    marginVertical: spacing.xs,
  },
  minOrderWarn: {
    backgroundColor: colors.warningLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  minOrderText: {
    ...typography.caption,
    color: colors.warning,
  },
});

export default BillSummary;
