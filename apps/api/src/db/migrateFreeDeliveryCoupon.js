// Pure decision logic for the one-time migration that replaces the old
// threshold/blanket delivery-fee settings with an equivalent free_delivery
// coupon, so migrate.js can stay a thin SQL executor and this can be unit
// tested without a DB connection.
const planFreeDeliveryMigration = (snapshot) => {
  const {
    minimum_order_amount: minimumOrderAmount,
    delivery_charge: deliveryCharge,
    below_threshold_delivery_charge: belowThresholdDeliveryCharge,
    free_delivery_above_minimum_active: freeAboveMinimumActive,
    free_delivery_offer_active: freeDeliveryOfferActive,
  } = snapshot;

  let coupon = null;
  let deliveryChargeUpdate = null;
  let warning = null;

  if (freeDeliveryOfferActive) {
    coupon = {
      code: null,
      title: 'Free Delivery (migrated)',
      description: 'Auto-created from the previous "always free delivery" setting.',
      discount_type: 'free_delivery',
      discount_value: 0,
      min_order_amount: 0,
    };
    deliveryChargeUpdate = Number(belowThresholdDeliveryCharge);
  } else if (freeAboveMinimumActive) {
    coupon = {
      code: null,
      title: 'Free Delivery (migrated)',
      description: 'Auto-created from the previous "free delivery above minimum order" setting.',
      discount_type: 'free_delivery',
      discount_value: 0,
      min_order_amount: Number(minimumOrderAmount),
    };
    deliveryChargeUpdate = Number(belowThresholdDeliveryCharge);
  } else if (Number(deliveryCharge) !== Number(belowThresholdDeliveryCharge)) {
    warning = `[migrate] WARNING: settings had free_delivery_above_minimum_active=false with delivery_charge=${deliveryCharge} != below_threshold_delivery_charge=${belowThresholdDeliveryCharge} — these differ and cannot both be preserved by a discount-only coupon system. Keeping delivery_charge=${deliveryCharge}; admin must manually reconcile pricing for orders under the old threshold.`;
  }

  return { coupon, deliveryChargeUpdate, warning };
};

module.exports = { planFreeDeliveryMigration };
