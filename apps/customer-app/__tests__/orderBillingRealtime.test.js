import { mergeAdminOrderPatch, mergeOrderRealtimePatch } from '../src/utils/realtimeOrder';
import { isOrderItemBillable, excludedItemLabel } from '../src/utils/orderBilling';

const patch = { billingRevision: 3, total: 78, subtotal: 33, night_charge: 45,
  discount_amount: 0, deal_discount_amount: 0, free_delivery_waiver_amount: 0,
  items: [{ id: 1, product_name: 'Milk', unit_price: 33, shop_billable: 1 },
    { id: 2, product_name: 'Fries', unit_price: 99, shop_billable: 0, shop_rejected_at: '2026-10-06' }] };

describe('shop billing realtime patches', () => {
  it('updates the customer total, full bill and item exclusion together', () => {
    const next = mergeOrderRealtimePatch({ total: 177, bill: { subtotal: 132, grandTotal: 177, discount: 10 } }, patch);
    expect(next.total).toBe(78);
    expect(next.bill).toMatchObject({ subtotal: 33, grandTotal: 78, nightCharge: 45, discount: 0, itemDiscount: 0 });
    expect(next.items[1].name).toBe('Fries');
    expect(isOrderItemBillable(next.items[1])).toBe(false);
  });

  it('retains checkout prices supplied in camelCase', () => {
    const next = mergeOrderRealtimePatch({}, { items: [{ name: 'Milk', unitPrice: 33, lineTotal: 33, quantity: 1 }] });
    expect(next.items[0].price).toBe(33);
  });

  it('keeps an admin breakdown and its response aliases consistent', () => {
    const next = mergeAdminOrderPatch({ discountAmount: 10, discount_amount: 10, freeDeliveryWaiverAmount: 5 }, patch);
    expect(next).toMatchObject({ total: 78, discountAmount: 0, discount_amount: 0,
      freeDeliveryWaiverAmount: 0, free_delivery_waiver_amount: 0, nightCharge: 45, night_charge: 45 });
  });

  it.each([mergeAdminOrderPatch, mergeOrderRealtimePatch])('does not let delayed rejection overwrite newer acceptance', merge => {
    const current = { billing_revision: 4, total: 177, items: [] };
    expect(merge(current, patch)).toBe(current);
    expect(merge(current, { ...patch, billingRevision: 5 }).total).toBe(78);
  });

  it('holds resent goods out of the bill until accepted', () => {
    const pending = { shop_rejected_at: null, shop_billable: 0 };
    expect(isOrderItemBillable(pending)).toBe(false);
    expect(excludedItemLabel(pending)).toMatch(/Awaiting/i);
    expect(isOrderItemBillable({ ...pending, shop_billable: 1 })).toBe(true);
  });
});
