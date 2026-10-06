const { calculateOrderBilling } = require('../src/services/orderBilling');

const order = { subtotal: 132, total: 177, night_charge: 45 };
const originalItems = [
  { id: 1, line_total: 33, unit_price: 33, shop_billable: 1 },
  { id: 2, line_total: 99, unit_price: 99, shop_billable: 1 },
];

describe('order billing after shop decisions', () => {
  it('removes rejected goods immediately, holds them out on resend, and restores exactly once on accept', () => {
    const initial = calculateOrderBilling(order, originalItems);
    const rejected = { ...originalItems[1], shop_rejected_at: new Date(), shop_billable: 0 };
    const afterReject = calculateOrderBilling({ ...order, ...initial }, [originalItems[0], rejected]);
    expect(afterReject).toMatchObject({ subtotal: 33, total: 78 });
    const afterResend = calculateOrderBilling({ ...order, ...afterReject }, [originalItems[0], { ...rejected, shop_rejected_at: null }]);
    expect(afterResend).toMatchObject({ subtotal: 33, total: 78 });
    const afterAccept = calculateOrderBilling({ ...order, ...afterResend }, originalItems);
    expect(afterAccept).toMatchObject({ subtotal: 132, total: 177 });
    expect(calculateOrderBilling(afterAccept, originalItems)).toEqual(afterAccept);
  });

  it('keeps coupon allocations, delivery waivers and deal savings reversible', () => {
    const items = [{ unit_price: 100, line_total: 100, deal_price: 20, deal_qty: 1 }, { unit_price: 200, line_total: 200 }];
    const fullOrder = { subtotal: 300, total: 198, delivery_charge: 30, night_charge: 10,
      discount_amount: 142, deal_discount_amount: 80, free_delivery_waiver_amount: 30 };
    const initial = calculateOrderBilling(fullOrder, items);
    expect(initial).toMatchObject({ total: 198, discount_amount: 142 });
    const excluded = calculateOrderBilling({ ...fullOrder, ...initial }, [{ ...items[0], shop_billable: 0 }, items[1]]);
    expect(excluded).toMatchObject({ subtotal: 200, deal_discount_amount: 0, discount_amount: 59.09, total: 180.91 });
    expect(calculateOrderBilling({ ...fullOrder, ...excluded }, items)).toEqual(initial);
  });

  it('zeroes the bill when nothing can be supplied and retains the original quote for restoration', () => {
    const initial = calculateOrderBilling(order, originalItems);
    const empty = calculateOrderBilling({ ...order, ...initial }, originalItems.map(it => ({ ...it, shop_billable: 0 })));
    expect(empty).toMatchObject({ subtotal: 0, total: 0, discount_amount: 0, night_charge: 0 });
    expect(calculateOrderBilling({ ...order, ...empty }, originalItems)).toEqual(initial);
  });

  it('uses checkout snapshots despite later coupon edits and handles fractional prices without drift', () => {
    const items = [{ unit_price: 0.99, line_total: 2.97 }, { unit_price: 1.03, line_total: 3.09 }];
    const quote = { subtotal: 6.06, discount_amount: 1.01 };
    const initial = calculateOrderBilling(quote, items);
    let bill = initial;
    for (let i = 0; i < 20; i++) {
      bill = calculateOrderBilling({ ...quote, ...bill }, [items[0], { ...items[1], shop_billable: 0 }]);
      expect(bill.total).toBe(2.47);
      bill = calculateOrderBilling({ ...quote, ...bill }, items);
      expect(bill.total).toBe(5.05);
    }
  });
});
