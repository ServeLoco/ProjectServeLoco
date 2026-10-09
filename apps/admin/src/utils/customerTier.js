export function getCustomerTier(deliveredOrderCount) {
  // An older API without this field must not mislabel existing customers New.
  if (deliveredOrderCount == null) return null;
  const count = Number(deliveredOrderCount);
  if (!Number.isInteger(count) || count < 0) return null;
  const label = count === 0 ? 'New' : count <= 5 ? 'Starter' : count <= 15 ? 'Regular' : 'Loyal';
  return { count, label };
}
