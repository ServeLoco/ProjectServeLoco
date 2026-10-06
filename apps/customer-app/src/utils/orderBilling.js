// Keep rejected lines visible as history, but never add them to the bill.
export function isOrderItemBillable(item) {
  return !item.rejected && item.shop_rejected_at == null
    && item.billable !== false && Number(item.shop_billable ?? 1) === 1;
}
export function excludedItemLabel(item) {
  return item.rejected || item.shop_rejected_at != null
    ? 'Rejected · not charged' : 'Awaiting acceptance · not charged';
}
