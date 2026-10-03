import {
  drawableOfferCards,
  offerCardColorOf,
  offerCardDesignOf,
} from '../src/components/OfferCards/offerCardDesigns';

const dealCard = (extra = {}) => ({
  id: 1,
  design: 'deal_tabs',
  dealId: 7,
  deal: { tiers: [{ price: 9, items: [] }] },
  ...extra,
});

describe('offer card designs', () => {
  test('draws known designs only, and only when the card has what it needs', () => {
    const section = {
      items: [
        dealCard({ id: 1 }),
        dealCard({ id: 2, deal: { tiers: [] } }), // nothing to show
        { id: 3, design: 'some_new_design' }, // from a newer admin
      ],
    };
    expect(drawableOfferCards(section).map((c) => c.id)).toEqual([1]);
    expect(drawableOfferCards(null)).toEqual([]);
  });

  test("a card's main colour comes from its design", () => {
    expect(offerCardColorOf(dealCard({ style: { tabColor: '#2E9E45' } }))).toBe('#2E9E45');
    expect(offerCardColorOf(dealCard())).toBe('#5B2FD6'); // the design's default
    expect(offerCardColorOf({ design: 'some_new_design' })).toBeNull();
  });

  test('the deal tabs card opens its Deal page', () => {
    const card = dealCard();
    expect(offerCardDesignOf(card).viewAll(card)).toEqual({ name: 'Deal', params: { couponId: 7, card } });
  });

  test('a "Deals of the day" card (template 2) needs products and opens its own page', () => {
    const dayCard = (extra = {}) => ({ id: 9, design: 'deals_of_day', products: [{ id: 1 }], ...extra });
    expect(drawableOfferCards({ items: [dayCard(), dayCard({ id: 10, products: [] })] }).map((c) => c.id)).toEqual([9]);
    expect(offerCardColorOf(dayCard())).toBe('#E8590C'); // its default main colour
    expect(offerCardColorOf(dayCard({ style: { accentColor: '#1971C2' } }))).toBe('#1971C2');
    const card = dayCard();
    expect(offerCardDesignOf(card).viewAll(card)).toEqual({ name: 'OfferCard', params: { cardId: 9, card } });
  });
});
