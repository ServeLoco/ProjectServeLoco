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
});
