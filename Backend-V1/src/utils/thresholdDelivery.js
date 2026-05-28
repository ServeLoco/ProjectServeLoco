const BELOW_THRESHOLD_DELIVERY_CHARGE = 20;
const { roundMoney } = require('./money');

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
  const total = roundMoney(subtotal);
  const freeDeliveryOfferActive = isEnabled(settings.free_delivery_offer_active);
  const freeAboveThresholdActive = isEnabled(settings.free_delivery_above_minimum_active, true);
  
  const standardDeliveryCharge = getNonNegativeAmount(settings.delivery_charge, 0);

  const belowThresholdCharge = getNonNegativeAmount(
    settings.below_threshold_delivery_charge,
    BELOW_THRESHOLD_DELIVERY_CHARGE
  );

  if (freeDeliveryOfferActive) {
    return {
      charge: 0,
      threshold,
      belowThreshold: false,
      belowThresholdCharge: 0,
      message: 'Free delivery offer applied!',
      freeDeliveryOfferActive: true,
      freeAboveThresholdActive,
    };
  }

  if (threshold <= 0 || total >= threshold) {
    const charge = freeAboveThresholdActive ? 0 : roundMoney(standardDeliveryCharge);
    return {
      charge,
      threshold,
      belowThreshold: false,
      belowThresholdCharge: roundMoney(belowThresholdCharge),
      message: freeAboveThresholdActive
        ? 'Free delivery unlocked!'
        : (charge > 0 ? `Standard delivery charge ₹${charge} applied.` : 'No delivery charge applied.'),
      freeDeliveryOfferActive: false,
      freeAboveThresholdActive,
    };
  }

  return {
    charge: roundMoney(belowThresholdCharge),
    threshold,
    belowThreshold: threshold > 0 && total < threshold,
    belowThresholdCharge: roundMoney(belowThresholdCharge),
    message: threshold > 0
      ? `Add ₹${roundMoney(Math.max(0, threshold - total))} more${freeAboveThresholdActive ? ' for free delivery' : ''}. ₹${roundMoney(belowThresholdCharge)} delivery applied.`
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
