import { offerRailStops } from '../src/screens/customer/HomeScreen/OfferCardsRail';

// A 360-wide phone: cards are 255 wide with a 10 gap and a 10 gutter.
const base = { cardWidth: 255, railWidth: 360, gutter: 10 };

describe('offerRailStops', () => {
  it('puts the first card at the start, the last at the end and the ones between in the middle', () => {
    const stops = offerRailStops({ ...base, count: 4 });
    expect(stops[0]).toBe(0);
    expect(stops[3]).toBe(20 + 4 * 265 - 10 - 360); // the end of the row
    // Cards 1 and 2 have their middle on the screen's middle (to a pixel).
    expect(Math.abs(10 + 265 + 255 / 2 - stops[1] - 180)).toBeLessThanOrEqual(1);
    expect(Math.abs(10 + 2 * 265 + 255 / 2 - stops[2] - 180)).toBeLessThanOrEqual(1);
  });

  it('stays at 0 for one card and goes start → end for two', () => {
    expect(offerRailStops({ ...base, count: 1 })).toEqual([0]);
    expect(offerRailStops({ ...base, count: 2 })).toEqual([0, 20 + 2 * 265 - 10 - 360]);
  });

  it('drops repeats when asked, so the row never "moves" to where it already is', () => {
    const tiny = offerRailStops({ cardWidth: 100, railWidth: 360, gutter: 10, count: 3, unique: true });
    expect(tiny).toEqual([0]); // all three fit on screen: nothing to move
  });
});
