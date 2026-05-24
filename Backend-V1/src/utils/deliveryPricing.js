/**
 * Calculates geodetic distance between two coordinates using the Haversine formula.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates delivery eligibility and pricing.
 * @param {object} params
 * @param {number} params.customerLat Customer latitude
 * @param {number} params.customerLng Customer longitude
 * @param {object} params.settings Shop settings containing coordinates, radius, cost per km, etc.
 * @returns {object} Calculated pricing and eligibility details
 */
function calculateDeliveryPricing({ customerLat, customerLng, settings }) {
  // If coordinates are missing
  if (customerLat === undefined || customerLat === null || customerLng === undefined || customerLng === null || customerLat === '' || customerLng === '') {
    return {
      allowed: false,
      charge: 0,
      distance: null,
      message: 'Customer GPS location is required.',
      code: 'MISSING_CUSTOMER_LOCATION',
      requiresLocation: true
    };
  }

  // If shop coordinates are missing
  const shopLat = settings.shop_latitude;
  const shopLng = settings.shop_longitude;
  if (shopLat === undefined || shopLat === null || shopLng === undefined || shopLng === null) {
    return {
      allowed: false,
      charge: 0,
      distance: null,
      message: 'Shop location is not configured by admin.',
      code: 'MISSING_SHOP_LOCATION',
      requiresLocation: false
    };
  }

  const distance = calculateDistance(
    Number(customerLat),
    Number(customerLng),
    Number(shopLat),
    Number(shopLng)
  );

  const radiusLimit = Number(settings.delivery_radius_km) !== undefined && settings.delivery_radius_km !== null
    ? Number(settings.delivery_radius_km)
    : 8.00;

  if (distance > radiusLimit) {
    return {
      allowed: false,
      charge: 0,
      distance,
      message: `We do not deliver to this location. Distance (${distance.toFixed(2)} km) exceeds our delivery limit of ${radiusLimit} km.`,
      code: 'OUT_OF_RANGE',
      requiresLocation: false
    };
  }

  // Calculate delivery charge
  let charge = 0;
  const isFreeOfferActive = settings.free_delivery_offer_active === true || settings.free_delivery_offer_active === 1 || settings.free_delivery_offer_active === 'true';

  if (!isFreeOfferActive) {
    const costPerKm = Number(settings.delivery_cost_per_km) || 0;
    charge = distance * costPerKm;
  }

  // Round charge to two decimal places
  charge = Math.round((charge + Number.EPSILON) * 100) / 100;

  return {
    allowed: true,
    charge,
    distance,
    message: isFreeOfferActive ? 'Free delivery offer applied!' : `Delivery charge calculated at ₹${settings.delivery_cost_per_km}/km.`,
    code: 'DELIVERY_ALLOWED',
    requiresLocation: false,
    freeDeliveryOfferActive: isFreeOfferActive
  };
}

module.exports = {
  calculateDistance,
  calculateDeliveryPricing
};
