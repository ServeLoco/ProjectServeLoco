const { calculateThresholdDeliveryCharge } = require('./Backend-V1/src/utils/thresholdDelivery');
const settings = { minimum_order_amount: 100, delivery_charge: 50, below_threshold_delivery_charge: 20, free_delivery_above_minimum_active: true, free_delivery_offer_active: false };
console.log(calculateThresholdDeliveryCharge({ subtotal: 50, settings }));
console.log(calculateThresholdDeliveryCharge({ subtotal: 150, settings }));
