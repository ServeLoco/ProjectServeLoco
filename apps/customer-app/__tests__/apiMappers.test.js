import {
  normalizeCartCalculation,
  normalizeOrder,
  normalizeProduct,
} from '../src/utils/apiMappers';

describe('api mappers', () => {
  it('maps location delivery fields from cart calculation response', () => {
    const result = normalizeCartCalculation({
      data: {
        subtotal: 200,
        deliveryCharge: 12.34,
        grandTotal: 212.34,
        deliveryDistanceKm: 1.2345,
        deliveryRadiusKm: 8,
        deliveryWithinRange: false,
        requiresLocation: true,
        freeDeliveryProgress: { minOrder: 149, amountRemaining: 30 },
        deliveryMessage: 'Pin location to calculate delivery.',
      },
    });

    expect(result.deliveryDistanceKm).toBe(1.2345);
    expect(result.deliveryRadiusKm).toBe(8);
    expect(result.deliveryWithinRange).toBe(false);
    expect(result.requiresLocation).toBe(true);
    expect(result.freeDeliveryProgress).toEqual({ minOrder: 149, amountRemaining: 30, minItemCount: 0, itemsRemaining: 0, thresholdType: 'amount' });
    expect(result.deliveryMessage).toBe('Pin location to calculate delivery.');
  });

  it('maps nearestOfferProgress (camelCase) from cart calculation response', () => {
    const result = normalizeCartCalculation({
      data: {
        subtotal: 100,
        nearestOfferProgress: {
          title: '20% Off',
          discountType: 'percent',
          minOrder: 250,
          amountRemaining: 150,
          savingsText: 'You save ₹40',
          requiresCode: false,
          autoApply: true,
        },
      },
    });

    expect(result.nearestOfferProgress).toEqual({
      title: '20% Off',
      discountType: 'percent',
      minOrder: 250,
      amountRemaining: 150,
      minItemCount: 0,
      itemsRemaining: 0,
      thresholdType: 'amount',
      savingsText: 'You save ₹40',
      requiresCode: false,
      autoApply: true,
    });
  });

  it('maps nearest_offer_progress (snake_case) from cart calculation response', () => {
    const result = normalizeCartCalculation({
      data: {
        subtotal: 100,
        nearest_offer_progress: {
          title: 'Flat ₹50 Off',
          discount_type: 'flat',
          min_order: 500,
          amount_remaining: 220,
          savings_text: '₹50 off',
          requires_code: true,
          auto_apply: false,
        },
      },
    });

    expect(result.nearestOfferProgress).toEqual({
      title: 'Flat ₹50 Off',
      discountType: 'flat',
      minOrder: 500,
      amountRemaining: 220,
      minItemCount: 0,
      itemsRemaining: 0,
      thresholdType: 'amount',
      savingsText: '₹50 off',
      requiresCode: true,
      autoApply: false,
    });
  });

  it('returns null nearestOfferProgress when absent', () => {
    const result = normalizeCartCalculation({ data: { subtotal: 100 } });
    expect(result.nearestOfferProgress).toBeNull();
  });

  it('maps appliedCoupon, couponError, and availableCoupons from cart calculation response', () => {
    const result = normalizeCartCalculation({
      data: {
        subtotal: 100,
        appliedCoupon: { id: 1, code: 'FLAT10', title: 'Flat 10', autoApplied: false },
        couponError: 'Invalid coupon code',
        availableCoupons: [{ id: 2, code: 'SAVE20' }],
      },
    });

    expect(result.appliedCoupon).toEqual({ id: 1, code: 'FLAT10', title: 'Flat 10', autoApplied: false });
    expect(result.couponError).toBe('Invalid coupon code');
    expect(result.availableCoupons).toEqual([{ id: 2, code: 'SAVE20' }]);
  });

  it('maps delivery snapshot fields from order response', () => {
    const result = normalizeOrder({
      id: 10,
      total: 250,
      delivery_distance_km: 2.5,
      delivery_radius_km_snapshot: 8,
      delivery_cost_per_km_snapshot: 10,
      free_delivery_offer_snapshot: 1,
    });

    expect(result.deliveryDistanceKm).toBe(2.5);
    expect(result.deliveryRadiusKmSnapshot).toBe(8);
    expect(result.deliveryCostPerKmSnapshot).toBe(10);
    expect(result.freeDeliveryOfferSnapshot).toBe(true);
  });

  it('maps time-window fields on a product (in-window case)', () => {
    const result = normalizeProduct({
      id: 1, name: 'Burger', price: '100',
      in_time_window: true,
      available_from_time: '10:00:00',
      available_until_time: '18:00:00',
    });
    expect(result.inTimeWindow).toBe(true);
    expect(result.availableFromTime).toBe('10:00:00');
    expect(result.availableUntilTime).toBe('18:00:00');
  });

  it('maps time-window fields on a product (out-of-window case)', () => {
    const result = normalizeProduct({
      id: 2, name: 'Late-Night Burger', price: '150',
      in_time_window: false,
      available_from_time: '22:00:00',
      available_until_time: '02:00:00',
    });
    expect(result.inTimeWindow).toBe(false);
    expect(result.availableFromTime).toBe('22:00:00');
    expect(result.availableUntilTime).toBe('02:00:00');
  });

  it('defaults inTimeWindow to true when field is missing (no window set)', () => {
    const result = normalizeProduct({ id: 3, name: 'Always Available', price: '50' });
    expect(result.inTimeWindow).toBe(true);
    expect(result.availableFromTime).toBeNull();
    expect(result.availableUntilTime).toBeNull();
  });
});

  it('normalizes profile whatsapp field correctly', () => {
    const { normalizeProfile } = require('../src/utils/apiMappers');
    expect(normalizeProfile({ whatsapp_number: '123' }).whatsapp).toBe('123');
    expect(normalizeProfile({ whatsappNumber: '456' }).whatsapp).toBe('456');
    expect(normalizeProfile({ whatsapp: '789' }).whatsapp).toBe('789');
    expect(normalizeProfile({ whatsapp_number: '123' }).whatsapp_number).toBe('123'); // retains original
  });
