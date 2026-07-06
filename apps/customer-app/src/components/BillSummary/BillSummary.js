import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius, borderWidth } from '../../theme';
import { buildProgressHintText } from '../../utils';

/**
 * BillSummary
 * Displays cart/order bill breakdown.
 *
 * Props:
 *   subtotal          - number
 *   deliveryCharge    - number
 *   nightCharge       - number (0 or undefined = not shown)
 *   discount          - number (0 or undefined = not shown) — total coupon discount
 *   itemDiscount      - number — discount excluding any free-delivery waiver;
 *                        shown on the Discount row when isFreeDeliveryApplied
 *                        is true so delivery isn't double-counted
 *   isFreeDeliveryApplied - bool — renders Delivery Charge as struck-through + FREE
 *   total             - number (grand total)
 *   freeDeliveryProgress - { minOrder, amountRemaining } | null — from the
 *                           cart-calculate response; shows a hint when set
 *   style             - container style
 */
function BillSummary({
  subtotal = 0,
  deliveryCharge = 0,
  nightCharge = 0,
  discount = 0,
  itemDiscount = null,
  isFreeDeliveryApplied = false,
  total = 0,
  freeDeliveryProgress = null,
  style,
}) {
  const showNight = nightCharge > 0;
  const discountToShow = isFreeDeliveryApplied ? (itemDiscount ?? Math.max(0, discount - deliveryCharge)) : discount;
  const showDiscount = discountToShow > 0;

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.heading}>Bill Summary</Text>

      <BillRow label="Subtotal" value={`₹${subtotal.toFixed(0)}`} />
      {isFreeDeliveryApplied ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Delivery Charge</Text>
          <View style={styles.freeDeliveryValueRow}>
            <Text style={styles.deliveryStrikethrough}>₹{deliveryCharge.toFixed(0)}</Text>
            <Text style={[styles.rowValue, { color: colors.success }]}>FREE</Text>
          </View>
        </View>
      ) : (
        <BillRow label="Delivery Charge" value={`₹${deliveryCharge.toFixed(0)}`} />
      )}
      {showNight ? (
        <BillRow label="Night Charge" value={`₹${nightCharge.toFixed(0)}`} warn />
      ) : null}
      {showDiscount ? (
        <BillRow label="Discount" value={`- ₹${discountToShow.toFixed(0)}`} success />
      ) : null}

      <View style={styles.divider} />

      <BillRow label="Grand Total" value={`₹${total.toFixed(0)}`} total />

      {freeDeliveryProgress ? (
        <View style={styles.minOrderWarn}>
          <Text style={styles.minOrderText}>
            {buildProgressHintText(freeDeliveryProgress, { suffix: ' to unlock free delivery.' })}
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
  freeDeliveryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deliveryStrikethrough: {
    ...typography.label,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
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
