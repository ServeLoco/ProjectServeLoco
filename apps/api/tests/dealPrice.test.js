/**
 * Deal price coupons (discount_type = 'deal_price'): the pure unit picker and
 * applyBestDeal's selection, with the pool mocked.
 *
 * Owner rules being pinned here (2026-10-03; held units 2026-10-04):
 *  - only the OTHER items count toward the deal's minimum,
 *  - at most deal_max_items units, biggest saving first,
 *  - all or nothing: below the minimum the deal's units are held — not
 *    billed — instead of charged at the full price,
 *  - only lines picked from the deal (Select on its card / Deal page, sent as
 *    dealCouponId) can get the deal price,
 *  - a deal stacks with one normal coupon (so it is invisible to the coupon
 *    functions — see the SQL assertions at the bottom).
 */

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn().mockResolvedValue([[]]) },
}));

const { pool } = require('../src/db/mysql');
const {
  pickDealUnits,
  dealLineKey,
  applyBestDeal,
  pickBestAutoApply,
  validateCouponById,
} = require('../src/utils/coupons');

const prices = (entries) => new Map(entries.map(([productId, variantId, price]) => [dealLineKey(productId, variantId), price]));

const line = (productId, unitPrice, quantity = 1, extra = {}) => ({
  productId, variantId: null, type: 'product', unitPrice, quantity, ...extra,
});
// A line the customer picked from deal 50.
const deal = (productId, unitPrice, quantity = 1, extra = {}) => line(productId, unitPrice, quantity, { dealCouponId: 50, ...extra });

describe('pickDealUnits', () => {
  it('sells one unit at the deal price once the other items reach the minimum', () => {
    const lines = [line(1, 300), deal(2, 30)];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 330, minOrder: 299, maxItems: 1 });
    expect(result.unlocked).toBe(true);
    expect(result.dealDiscount).toBe(21);
    expect(result.lines).toEqual([{ index: 1, dealPrice: 9, dealQty: 1 }]);
    expect(result.amountRemaining).toBe(0);
  });

  it('does not count the deal item itself toward the minimum', () => {
    // 280 + 30 = 310 ≥ 299, but the other items alone are only 280.
    const lines = [line(1, 280), deal(2, 30)];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 310, minOrder: 299, maxItems: 1 });
    expect(result.unlocked).toBe(false);
    expect(result.dealDiscount).toBe(0);
    expect(result.lines).toEqual([]);
    expect(result.held).toEqual([{ index: 1, dealPrice: 9, qty: 1 }]);
    expect(result.amountRemaining).toBe(19);
  });

  it('sells every deal unit or none of them', () => {
    const lines = [line(1, 280), deal(2, 30), deal(3, 30)];
    const args = { couponId: 50, lines, dealPrices: prices([[2, null, 9], [3, null, 9]]), subtotal: 340, maxItems: 2 };

    const open = pickDealUnits({ ...args, minOrder: 250 });
    expect(open.unlocked).toBe(true);
    expect(open.dealDiscount).toBe(42);
    expect(open.lines).toEqual([{ index: 1, dealPrice: 9, dealQty: 1 }, { index: 2, dealPrice: 9, dealQty: 1 }]);
    expect(open.held).toEqual([]);

    // One deal unit never counts toward another's minimum.
    const locked = pickDealUnits({ ...args, minOrder: 299 });
    expect(locked.unlocked).toBe(false);
    expect(locked.held).toEqual([{ index: 1, dealPrice: 9, qty: 1 }, { index: 2, dealPrice: 9, qty: 1 }]);
    expect(locked.amountRemaining).toBe(19);
  });

  it('checks the minimum against othersTotal when given', () => {
    const lines = [line(1, 300), deal(2, 30)];
    const result = pickDealUnits({
      couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 330, othersTotal: 260, minOrder: 299, maxItems: 1,
    });
    expect(result.unlocked).toBe(false);
    expect(result.amountRemaining).toBe(39);
  });

  it('caps the units at deal_max_items across the whole cart', () => {
    const lines = [line(1, 500), deal(2, 30, 3)];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 590, minOrder: 299, maxItems: 1 });
    expect(result.lines).toEqual([{ index: 1, dealPrice: 9, dealQty: 1 }]);
    expect(result.dealDiscount).toBe(21);
  });

  it('extra units of a deal product beyond the cap count as other items', () => {
    // Other items: 270 + one potato at its normal 35 = 305 ≥ 299.
    const lines = [line(1, 270), deal(2, 35, 2)];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 340, minOrder: 299, maxItems: 1 });
    expect(result.unlocked).toBe(true);
    expect(result.dealDiscount).toBe(26);
  });

  it('picks the biggest saving first', () => {
    const lines = [line(1, 400), deal(2, 30), deal(3, 99)];
    const result = pickDealUnits({
      couponId: 50,
      lines,
      dealPrices: prices([[2, null, 9], [3, null, 29]]),
      subtotal: 529,
      minOrder: 299,
      maxItems: 1,
    });
    expect(result.lines).toEqual([{ index: 2, dealPrice: 29, dealQty: 1 }]);
    expect(result.dealDiscount).toBe(70);
  });

  it('a pick beyond the cap is an ordinary item; the deal unit is the biggest saving', () => {
    // Product 3 (99, saves 70) is the deal unit; product 2 sells at its normal
    // 30 and counts toward the minimum: 230 + 30 = 260 < 299.
    const lines = [line(1, 230), deal(2, 30), deal(3, 99)];
    const result = pickDealUnits({
      couponId: 50,
      lines,
      dealPrices: prices([[2, null, 9], [3, null, 29]]),
      subtotal: 359,
      minOrder: 299,
      maxItems: 1,
    });
    expect(result.unlocked).toBe(false);
    expect(result.held).toEqual([{ index: 2, dealPrice: 29, qty: 1 }]);
    expect(result.amountRemaining).toBe(39);
  });

  it('matches the exact variant only', () => {
    const lines = [line(1, 400), deal(2, 35, 1, { variantId: 7 }), deal(2, 160, 1, { variantId: 8 })];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, 7, 9]]), subtotal: 595, minOrder: 299, maxItems: 1 });
    expect(result.lines).toEqual([{ index: 1, dealPrice: 9, dealQty: 1 }]);
  });

  it('the same product added from a normal list keeps its normal price', () => {
    const lines = [line(1, 300), line(2, 30)];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 330, minOrder: 299, maxItems: 1 });
    expect(result.candidateCount).toBe(0);
    expect(result.dealDiscount).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it('a line picked from another deal does not match this one', () => {
    const lines = [line(1, 300), deal(2, 30, 1, { dealCouponId: 51 })];
    const result = pickDealUnits({ couponId: 50, lines, dealPrices: prices([[2, null, 9]]), subtotal: 330, minOrder: 299, maxItems: 1 });
    expect(result.candidateCount).toBe(0);
  });

  it('ignores combos and deal prices that are not below the current price', () => {
    const lines = [line(1, 400), deal(2, 30, 1, { type: 'combo' }), deal(3, 8)];
    const result = pickDealUnits({
      couponId: 50,
      lines,
      dealPrices: prices([[2, null, 9], [3, null, 9]]),
      subtotal: 438,
      minOrder: 299,
      maxItems: 1,
    });
    expect(result.candidateCount).toBe(0);
    expect(result.unlocked).toBe(false);
  });

  it('reports the shortfall against the whole cart when no deal item is in it', () => {
    const result = pickDealUnits({ couponId: 50, lines: [line(1, 40)], dealPrices: prices([[2, null, 9]]), subtotal: 40, minOrder: 299, maxItems: 1 });
    expect(result.candidateCount).toBe(0);
    expect(result.amountRemaining).toBe(259);
  });
});

const dealCoupon = (overrides = {}) => ({
  id: 50,
  code: null,
  title: '₹9ryday',
  discount_type: 'deal_price',
  discount_value: 0,
  min_order_amount: 299,
  min_item_count: null,
  max_order_amount: null,
  deal_max_items: 1,
  applies_to: 'all',
  starts_at: null,
  ends_at: null,
  active_days_mask: null,
  active_time_start: null,
  active_time_end: null,
  total_usage_limit: null,
  per_user_usage_limit: null,
  first_order_only: 0,
  first_n_orders: null,
  target_audience: 'all',
  target_zones: 'all',
  auto_apply: 1,
  requires_code: 0,
  priority: 0,
  active: 1,
  deleted: 0,
  ...overrides,
});

describe('applyBestDeal', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
  });

  it('returns null without an area (deals are per area)', async () => {
    const result = await applyBestDeal({ lines: [line(1, 300)], subtotal: 300, areaId: null });
    expect(result).toEqual({ deal: null, held: [] });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('applies the deal and scopes both lookups to the area', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon()]])
      .mockResolvedValueOnce([[{ coupon_id: 50, product_id: 2, variant_id: null, deal_price: '9.00' }]]);

    const result = await applyBestDeal({ lines: [line(1, 300), deal(2, 30)], subtotal: 330, areaId: 4 });

    expect(result.deal).toMatchObject({ couponId: 50, dealDiscount: 21, unlocked: true, minOrder: 299, maxItems: 1 });
    expect(result.deal.lines).toEqual([{ index: 1, dealPrice: 9, dealQty: 1 }]);
    expect(result.held).toEqual([]);
    expect(pool.query.mock.calls[0][0]).toContain("discount_type = 'deal_price'");
    expect(pool.query.mock.calls[0][1][0]).toBe(4);
    expect(pool.query.mock.calls[1][0]).toContain('FROM coupon_deal_items');
    expect(pool.query.mock.calls[0][1][1]).toEqual([50]);
    expect(pool.query.mock.calls[1][1]).toEqual([4, [50], [2]]);
  });

  it('returns a locked deal with the amount still missing, and holds its item', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon()]])
      .mockResolvedValueOnce([[{ coupon_id: 50, product_id: 2, variant_id: null, deal_price: 9 }]]);

    const result = await applyBestDeal({ lines: [line(1, 40), deal(2, 30)], subtotal: 70, areaId: 4 });

    expect(result.deal).toMatchObject({ couponId: 50, dealDiscount: 0, unlocked: false, amountRemaining: 259 });
    expect(result.held).toEqual([{ index: 1, qty: 1, reason: 'locked', couponId: 50, dealPrice: 9, amountRemaining: 259 }]);
  });

  it('returns null without a query when no line was picked from a deal', async () => {
    const result = await applyBestDeal({ lines: [line(1, 300), line(2, 30)], subtotal: 330, areaId: 4 });
    expect(result).toEqual({ deal: null, held: [] });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('sells the product at its normal price when it is no longer in the deal', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon()]])
      .mockResolvedValueOnce([[]]);
    const result = await applyBestDeal({ lines: [line(1, 300), deal(2, 30)], subtotal: 330, areaId: 4 });
    expect(result).toEqual({ deal: null, held: [] });
  });

  it('holds the item of a deal the customer has used up', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon({ per_user_usage_limit: 1 })]])
      .mockResolvedValueOnce([[{ coupon_id: 50, product_id: 2, variant_id: null, deal_price: 9 }]])
      .mockResolvedValueOnce([[{ count: 1 }]]); // getUserRedemptionCount

    const result = await applyBestDeal({ lines: [line(1, 300), deal(2, 30)], subtotal: 330, areaId: 4, userId: 9 });
    expect(result.deal).toBeNull();
    expect(result.held).toEqual([{ index: 1, qty: 1, reason: 'unavailable', couponId: 50, dealPrice: 9, amountRemaining: 0 }]);
  });

  it('holds the item of a deal limited to another store type (Applies To)', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon({ applies_to: 'grocery' })]])
      .mockResolvedValueOnce([[{ coupon_id: 50, product_id: 2, variant_id: null, deal_price: 9 }]]);

    const result = await applyBestDeal({ lines: [line(1, 300), deal(2, 30)], subtotal: 330, areaId: 4, storeType: 'mixed' });
    expect(result.deal).toBeNull();
    expect(result.held).toEqual([{ index: 1, qty: 1, reason: 'unavailable', couponId: 50, dealPrice: 9, amountRemaining: 0 }]);
  });

  it('holds the item of a deal that was switched off or ended', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon({ active: 0 }), dealCoupon({ id: 51, ends_at: '2020-01-01 00:00:00' })]])
      .mockResolvedValueOnce([[
        { coupon_id: 50, product_id: 2, variant_id: null, deal_price: 9 },
        { coupon_id: 51, product_id: 3, variant_id: null, deal_price: 9 },
      ]]);

    const lines = [line(1, 300), deal(2, 30), deal(3, 30, 1, { dealCouponId: 51 })];
    const result = await applyBestDeal({ lines, subtotal: 360, areaId: 4 });
    expect(result.deal).toBeNull();
    expect(result.held.map((h) => [h.index, h.reason])).toEqual([[1, 'unavailable'], [2, 'unavailable']]);
    // Ended deals are looked up too, so their units can be held.
    expect(pool.query.mock.calls[0][0]).not.toContain('active = 1');
  });

  it('picks the deal that saves the most', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon({ id: 50 }), dealCoupon({ id: 51, title: 'Big deal' })]])
      .mockResolvedValueOnce([[
        { coupon_id: 50, product_id: 2, variant_id: null, deal_price: 9 },
        { coupon_id: 51, product_id: 3, variant_id: null, deal_price: 1 },
      ]]);

    const lines = [line(1, 300), deal(2, 30), deal(3, 40, 1, { dealCouponId: 51 })];
    const result = await applyBestDeal({ lines, subtotal: 370, areaId: 4 });
    expect(result.deal).toMatchObject({ couponId: 51, dealDiscount: 39 });
    // One deal per order: the other deal's item is held, not charged in full.
    expect(result.held).toEqual([{ index: 1, qty: 1, reason: 'one_deal', couponId: 50, dealPrice: 9, amountRemaining: 0 }]);
  });

  it('checks each deal against the items picked from no deal', async () => {
    pool.query
      .mockResolvedValueOnce([[dealCoupon({ id: 50 }), dealCoupon({ id: 51 })]])
      .mockResolvedValueOnce([[
        { coupon_id: 50, product_id: 2, variant_id: null, deal_price: 9 },
        { coupon_id: 51, product_id: 3, variant_id: null, deal_price: 1 },
      ]]);

    // 280 + 30 + 40 = 350, but the items picked from no deal are only 280.
    const lines = [line(1, 280), deal(2, 30), deal(3, 40, 1, { dealCouponId: 51 })];
    const result = await applyBestDeal({ lines, subtotal: 350, areaId: 4 });
    expect(result.deal).toMatchObject({ unlocked: false, amountRemaining: 19 });
    expect(result.held.map((h) => [h.index, h.reason, h.amountRemaining])).toEqual([[1, 'locked', 19], [2, 'locked', 19]]);
  });
});

describe('deal coupons stay out of the normal coupon paths', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
  });

  it('pickBestAutoApply never loads a deal', async () => {
    await pickBestAutoApply({ subtotal: 500, areaId: 1 });
    expect(pool.query.mock.calls[0][0]).toContain("discount_type != 'deal_price'");
  });

  it('a deal cannot be forced through coupon_id', async () => {
    const result = await validateCouponById({ couponId: 50, subtotal: 500, areaId: 1 });
    expect(result.ok).toBe(false);
    expect(pool.query.mock.calls[0][0]).toContain("discount_type != 'deal_price'");
  });
});
