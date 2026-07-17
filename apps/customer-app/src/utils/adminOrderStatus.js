import { colors } from '../theme';

// Mirrors apps/admin/src/pages/Orders.jsx ORDER_STATUS_OPTIONS exactly —
// same values, same labels — so admin phone and web agree on wording.
export const ORDER_STATUS_OPTIONS = [
  { value: 'Pending', label: 'Order Placed', shortLabel: 'Placed' },
  { value: 'Accepted', label: 'Order Accepted', shortLabel: 'Accepted' },
  { value: 'Preparing', label: 'Preparing/Packing', shortLabel: 'Preparing' },
  { value: 'Out for Delivery', label: 'Out for Delivery', shortLabel: 'Out' },
  { value: 'Delivered', label: 'Delivered', shortLabel: 'Delivered' },
  { value: 'Cancelled', label: 'Cancelled', shortLabel: 'Cancelled' },
];

const ORDER_STATUS_LABELS = ORDER_STATUS_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || 'Unknown';
}

export function isTerminalOrderStatus(status) {
  return status === 'Delivered' || status === 'Cancelled';
}

const STATUS_COLORS = {
  Pending: { bg: colors.warningLight, text: colors.warning },
  Accepted: { bg: colors.infoLight, text: colors.info },
  Preparing: { bg: colors.infoLight, text: colors.info },
  'Out for Delivery': { bg: colors.saffronLight, text: colors.saffronDark },
  Delivered: { bg: colors.successLight, text: colors.successDark },
  Cancelled: { bg: colors.errorLight, text: colors.error },
};

export function getOrderStatusColors(status) {
  return STATUS_COLORS[status] || { bg: colors.bgApp, text: colors.textSecondary };
}

const PAYMENT_STATUS_COLORS = {
  Pending: { bg: colors.warningLight, text: colors.warning },
  Paid: { bg: colors.successLight, text: colors.successDark },
  Success: { bg: colors.successLight, text: colors.successDark },
  Failed: { bg: colors.errorLight, text: colors.error },
  Refunded: { bg: colors.bgApp, text: colors.textSecondary },
};

export function getPaymentStatusColors(status) {
  return PAYMENT_STATUS_COLORS[status] || { bg: colors.bgApp, text: colors.textSecondary };
}

export const PAYMENT_STATUS_OPTIONS = ['Pending', 'Paid', 'Success', 'Failed', 'Refunded'];
