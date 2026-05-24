const {
  calculateDistance,
  calculateDeliveryPricing,
} = require('../src/utils/deliveryPricing');

describe('Delivery pricing utility', () => {
  const baseSettings = {
    shop_latitude: 12.9716,
    shop_longitude: 77.5946,
    delivery_radius_km: 8,
    delivery_cost_per_km: 10,
    free_delivery_offer_active: 0,
  };

  it('calculates zero distance for identical coordinates', () => {
    const distance = calculateDistance(12.9716, 77.5946, 12.9716, 77.5946);

    expect(distance).toBe(0);
  });

  it('allows in-range delivery and charges exact per-km cost', () => {
    const result = calculateDeliveryPricing({
      customerLat: 12.9716,
      customerLng: 77.6046,
      settings: baseSettings,
    });

    expect(result.allowed).toBe(true);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.distance).toBeLessThan(8);
    expect(result.charge).toBeCloseTo(result.distance * 10, 2);
    expect(result.code).toBe('DELIVERY_ALLOWED');
  });

  it('blocks out-of-range delivery', () => {
    const result = calculateDeliveryPricing({
      customerLat: 13.2,
      customerLng: 77.5946,
      settings: baseSettings,
    });

    expect(result.allowed).toBe(false);
    expect(result.code).toBe('OUT_OF_RANGE');
    expect(result.message).toContain('exceeds our delivery limit');
  });

  it('requires customer coordinates', () => {
    const result = calculateDeliveryPricing({
      customerLat: null,
      customerLng: null,
      settings: baseSettings,
    });

    expect(result.allowed).toBe(false);
    expect(result.requiresLocation).toBe(true);
    expect(result.code).toBe('MISSING_CUSTOMER_LOCATION');
  });

  it('blocks when shop coordinates are missing', () => {
    const result = calculateDeliveryPricing({
      customerLat: 12.9716,
      customerLng: 77.5946,
      settings: {
        ...baseSettings,
        shop_latitude: null,
        shop_longitude: null,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.requiresLocation).toBe(false);
    expect(result.code).toBe('MISSING_SHOP_LOCATION');
  });

  it('applies global free delivery offer for in-range orders', () => {
    const result = calculateDeliveryPricing({
      customerLat: 12.9716,
      customerLng: 77.6046,
      settings: {
        ...baseSettings,
        free_delivery_offer_active: 1,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.charge).toBe(0);
    expect(result.freeDeliveryOfferActive).toBe(true);
  });

  it('allows zero per-km cost without free offer', () => {
    const result = calculateDeliveryPricing({
      customerLat: 12.9716,
      customerLng: 77.6046,
      settings: {
        ...baseSettings,
        delivery_cost_per_km: 0,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.charge).toBe(0);
    expect(result.freeDeliveryOfferActive).toBe(false);
  });

  it('falls back to 8 km radius and zero cost when settings are invalid', () => {
    const result = calculateDeliveryPricing({
      customerLat: 12.9716,
      customerLng: 77.6046,
      settings: {
        ...baseSettings,
        delivery_radius_km: 'not-a-number',
        delivery_cost_per_km: 'not-a-number',
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.charge).toBe(0);
  });
});
