import {
  normalizeCartCalculation,
  normalizeOrder,
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
        freeDeliveryOfferActive: true,
        deliveryMessage: 'Pin location to calculate delivery.',
      },
    });

    expect(result.deliveryDistanceKm).toBe(1.2345);
    expect(result.deliveryRadiusKm).toBe(8);
    expect(result.deliveryWithinRange).toBe(false);
    expect(result.requiresLocation).toBe(true);
    expect(result.freeDeliveryOfferActive).toBe(true);
    expect(result.deliveryMessage).toBe('Pin location to calculate delivery.');
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
});

  it('normalizes profile whatsapp field correctly', () => {
    const { normalizeProfile } = require('../src/utils/apiMappers');
    expect(normalizeProfile({ whatsapp_number: '123' }).whatsapp).toBe('123');
    expect(normalizeProfile({ whatsappNumber: '456' }).whatsapp).toBe('456');
    expect(normalizeProfile({ whatsapp: '789' }).whatsapp).toBe('789');
    expect(normalizeProfile({ whatsapp_number: '123' }).whatsapp_number).toBe('123'); // retains original
  });
