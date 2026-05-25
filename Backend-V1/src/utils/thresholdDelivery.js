const BELOW_THRESHOLD_DELIVERY_CHARGE = 20;

const isEnabled = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
};

const getNonNegativeAmount = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const getFreeDeliveryThreshold = (settings = {}) => {
  const threshold = Number(settings.minimum_order_amount);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : 0;
};

const calculateThresholdDeliveryCharge = ({ subtotal, settings = {} }) => {
  const threshold = getFreeDeliveryThreshold(settings);
  const total = Number(subtotal) || 0;
  const freeDeliveryOfferActive = isEnabled(settings.free_delivery_offer_active);
  const freeAboveThresholdActive = isEnabled(settings.free_delivery_above_minimum_active, true);
  const belowThresholdCharge = getNonNegativeAmount(
    settings.below_threshold_delivery_charge,
    BELOW_THRESHOLD_DELIVERY_CHARGE
  );
  const standardDeliveryCharge = getNonNegativeAmount(settings.delivery_charge, 0);

  if (freeDeliveryOfferActive) {
    return {
      charge: 0,
      threshold,
      belowThreshold: false,
      message: 'Free delivery offer applied!',
      freeDeliveryOfferActive: true,
      freeAboveThresholdActive,
    };
  }

  if (threshold <= 0 || total >= threshold) {
    const charge = freeAboveThresholdActive ? 0 : standardDeliveryCharge;
    return {
      charge,
      threshold,
      belowThreshold: false,
      message: freeAboveThresholdActive
        ? 'Free delivery unlocked!'
        : (charge > 0 ? `Standard delivery charge ₹${charge} applied.` : 'No delivery charge applied.'),
      freeDeliveryOfferActive: false,
      freeAboveThresholdActive,
    };
  }

  return {
    charge: belowThresholdCharge,
    threshold,
    belowThreshold: threshold > 0 && total < threshold,
    message: threshold > 0
      ? `Add ₹${Math.max(0, threshold - total)} more${freeAboveThresholdActive ? ' for free delivery' : ''}. ₹${belowThresholdCharge} delivery applied.`
      : `₹${belowThresholdCharge} delivery applied.`,
    freeDeliveryOfferActive: false,
    freeAboveThresholdActive,
  };
};

module.exports = {
  BELOW_THRESHOLD_DELIVERY_CHARGE,
  calculateThresholdDeliveryCharge,
  getFreeDeliveryThreshold,
};
