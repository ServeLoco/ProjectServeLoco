import { dealItemKey, cartLineKey, estimateDealProgress, indexDealItems, isDealLine } from '../src/utils/dealCart';

const deal = {
  id: 50,
  minOrder: 299,
  maxItems: 1,
  tiers: [
    { price: 9, items: [{ id: 2, name: 'Potato', dealPrice: 9, regularPrice: 30, dealVariantId: null }] },
    { price: 29, items: [{ id: 3, name: 'Onion', dealPrice: 29, regularPrice: 40, dealVariantId: 7 }] },
  ],
};

const line = (id, price, quantity = 1, variant = null) => ({
  product: { id: String(id), price },
  variant,
  quantity,
  type: 'product',
});
// A line picked from deal 50 (Select on its card / Deal page).
const picked = (id, price, quantity = 1, variant = null) => ({ ...line(id, price, quantity, variant), dealCouponId: 50 });

describe('deal cart estimate', () => {
  it('keys deal items and cart lines the same way', () => {
    expect(dealItemKey(3, 7)).toBe(cartLineKey(line(3, 40, 1, { id: '7', price: 40 })));
    expect(dealItemKey(2, null)).toBe(cartLineKey(line(2, 30)));
    expect([...indexDealItems(deal).keys()]).toEqual(['2:', '3:7']);
  });

  it('counts only the other items toward the minimum', () => {
    const result = estimateDealProgress([line(1, 280), picked(2, 30)], deal);
    expect(result.unlocked).toBe(false);
    expect(result.amountRemaining).toBe(19);
    expect(result.dealUnits).toBe(1);
  });

  it('unlocks once the other items reach the minimum', () => {
    const result = estimateDealProgress([line(1, 300), picked(2, 30)], deal);
    expect(result).toMatchObject({ unlocked: true, amountRemaining: 0, othersTotal: 300 });
  });

  it('with no deal item in the cart, the whole cart counts', () => {
    const result = estimateDealProgress([line(1, 40)], deal);
    expect(result).toMatchObject({ unlocked: false, amountRemaining: 259, dealUnits: 0 });
    expect(result.ratio).toBeCloseTo(40 / 299);
  });

  it('matches an option-priced deal only on that option', () => {
    const other = estimateDealProgress([line(1, 300), picked(3, 75, 1, { id: '8', price: 75 })], deal);
    expect(other.dealUnits).toBe(0);
    const same = estimateDealProgress([line(1, 300), picked(3, 40, 1, { id: '7', price: 40 })], deal);
    expect(same.dealUnits).toBe(1);
  });

  it('the same product added from a normal list is not a deal line', () => {
    const result = estimateDealProgress([line(1, 300), line(2, 30)], deal);
    expect(result.dealUnits).toBe(0);
    expect(result.dealLines).toEqual([]);
    // It counts as one of the other items instead.
    expect(result.othersTotal).toBe(330);
  });

  it('a line picked from another deal does not count for this one', () => {
    const other = { ...picked(2, 30), dealCouponId: 51 };
    expect(isDealLine(other, 50)).toBe(false);
    expect(estimateDealProgress([line(1, 300), other], deal).dealUnits).toBe(0);
  });
});
