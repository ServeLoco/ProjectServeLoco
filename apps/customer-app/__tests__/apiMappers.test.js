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

    expect(result.appliedCoupon).toEqual(expect.objectContaining({
      id: 1,
      code: 'FLAT10',
      title: 'Flat 10',
      autoApplied: false,
    }));
    expect(result.couponError).toBe('Invalid coupon code');
    expect(result.availableCoupons).toEqual([{ id: 2, code: 'SAVE20' }]);
  });

  it('preserves autoApplied so auto-apply coupons are not force-locked on the client', () => {
    const result = normalizeCartCalculation({
      data: {
        applied_coupon: {
          id: 9,
          code: 'FREEDEL',
          title: 'Free Delivery',
          discount_type: 'free_delivery',
          auto_applied: true,
          also_free_delivery: false,
          free_delivery_waiver: 30,
          item_discount: 0,
          discount: 30,
        },
      },
    });
    expect(result.appliedCoupon.autoApplied).toBe(true);
    expect(result.appliedCoupon.discountType).toBe('free_delivery');
    expect(result.appliedCoupon.freeDeliveryWaiver).toBe(30);
  });

  it('maps server-priced cart line items (unitPrice) for client price sync', () => {
    const result = normalizeCartCalculation({
      data: {
        subtotal: 180,
        items: [
          {
            id: 12,
            name: 'Milk (1L)',
            quantity: 2,
            unitPrice: 45,
            lineTotal: 90,
            type: 'product',
            variantId: 3,
            variantLabel: '1L',
          },
          {
            id: 99,
            name: 'Combo Box',
            quantity: 1,
            unit_price: 90,
            line_total: 90,
            type: 'combo',
            variant_id: null,
          },
        ],
      },
    });

    expect(result.items).toEqual([
      {
        id: '12',
        name: 'Milk (1L)',
        quantity: 2,
        unitPrice: 45,
        lineTotal: 90,
        type: 'product',
        variantId: 3,
        variantLabel: '1L',
      },
      {
        id: '99',
        name: 'Combo Box',
        quantity: 1,
        unitPrice: 90,
        lineTotal: 90,
        type: 'combo',
        variantId: null,
        variantLabel: null,
      },
    ]);
  });

  it('defaults cart calculation items to empty array when absent', () => {
    const result = normalizeCartCalculation({ data: { subtotal: 100 } });
    expect(result.items).toEqual([]);
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

  it('maps rider last position + delivery pin for live tracking', () => {
    const result = normalizeOrder({
      id: 42,
      status: 'Out for Delivery',
      latitude: '29.5152',
      longitude: '75.4548',
      rider_id: 3,
      rider: {
        id: 3,
        display_name: 'Ravi',
        last_lat: '29.5100',
        last_lng: '75.4500',
        last_location_at: '2026-07-13T12:00:00Z',
      },
    });

    expect(result.latitude).toBe(29.5152);
    expect(result.longitude).toBe(75.4548);
    expect(result.riderId).toBe(3);
    expect(result.rider_id).toBe(3);
    expect(result.rider).toEqual(expect.objectContaining({
      id: 3,
      displayName: 'Ravi',
      lastLat: 29.51,
      lastLng: 75.45,
      last_lat: 29.51,
      last_lng: 75.45,
      lastLocationAt: '2026-07-13T12:00:00Z',
    }));
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

  it('maps snake_case shop_is_open: 1 to shopIsOpen true', () => {
    const result = normalizeProduct({ id: 4, name: 'Open Shop Item', price: '60', shop_is_open: 1 });
    expect(result.shopIsOpen).toBe(true);
    expect(result.shop_is_open).toBe(true);
  });

  it('maps camelCase shopIsOpen: 0 to false', () => {
    const result = normalizeProduct({ id: 5, name: 'Closed Shop Item', price: '70', shopIsOpen: 0 });
    expect(result.shopIsOpen).toBe(false);
    expect(result.shop_is_open).toBe(false);
  });

  it('defaults shopIsOpen to true when the server field is absent', () => {
    const result = normalizeProduct({ id: 6, name: 'Legacy Item', price: '80' });
    expect(result.shopIsOpen).toBe(true);
    expect(result.shop_is_open).toBe(true);
  });
});

  it('normalizes profile whatsapp field correctly', () => {
    const { normalizeProfile } = require('../src/utils/apiMappers');
    expect(normalizeProfile({ whatsapp_number: '123' }).whatsapp).toBe('123');
    expect(normalizeProfile({ whatsappNumber: '456' }).whatsapp).toBe('456');
    expect(normalizeProfile({ whatsapp: '789' }).whatsapp).toBe('789');
    expect(normalizeProfile({ whatsapp_number: '123' }).whatsapp_number).toBe('123'); // retains original
  });
