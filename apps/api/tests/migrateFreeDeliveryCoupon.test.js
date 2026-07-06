const { planFreeDeliveryMigration } = require('../src/db/migrateFreeDeliveryCoupon');

describe('planFreeDeliveryMigration', () => {
  it('seeds an always-on (min_order_amount=0) coupon when free_delivery_offer_active was true', () => {
    const plan = planFreeDeliveryMigration({
      minimum_order_amount: 149,
      delivery_charge: 10,
      below_threshold_delivery_charge: 25,
      free_delivery_above_minimum_active: 1,
      free_delivery_offer_active: 1,
    });

    expect(plan.coupon).toMatchObject({ discount_type: 'free_delivery', min_order_amount: 0 });
    expect(plan.deliveryChargeUpdate).toBe(25);
    expect(plan.warning).toBeNull();
  });

  it('seeds a threshold-replica coupon when only free_delivery_above_minimum_active was true', () => {
    const plan = planFreeDeliveryMigration({
      minimum_order_amount: 149,
      delivery_charge: 10,
      below_threshold_delivery_charge: 25,
      free_delivery_above_minimum_active: 1,
      free_delivery_offer_active: 0,
    });

    expect(plan.coupon).toMatchObject({ discount_type: 'free_delivery', min_order_amount: 149 });
    expect(plan.deliveryChargeUpdate).toBe(25);
    expect(plan.warning).toBeNull();
  });

  it('seeds nothing when neither flag was active and the rates already matched', () => {
    const plan = planFreeDeliveryMigration({
      minimum_order_amount: 149,
      delivery_charge: 20,
      below_threshold_delivery_charge: 20,
      free_delivery_above_minimum_active: 0,
      free_delivery_offer_active: 0,
    });

    expect(plan.coupon).toBeNull();
    expect(plan.deliveryChargeUpdate).toBeNull();
    expect(plan.warning).toBeNull();
  });

  it('warns and leaves delivery_charge untouched for the unrepresentable combo (two differing non-zero rates, no free-above flag)', () => {
    const plan = planFreeDeliveryMigration({
      minimum_order_amount: 149,
      delivery_charge: 12,
      below_threshold_delivery_charge: 35,
      free_delivery_above_minimum_active: 0,
      free_delivery_offer_active: 0,
    });

    expect(plan.coupon).toBeNull();
    expect(plan.deliveryChargeUpdate).toBeNull();
    expect(plan.warning).toMatch(/cannot both be preserved/);
  });
});
