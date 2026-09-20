import { orderHomeUnits, isSectionAllUnavailable } from '../src/screens/customer/HomeScreen/homeSectionOrder';

// Real behaviour of the order Home draws its sections in — not a source check.
// `sections` arrive in the admin's App Home order (that is how the dashboard
// returns them); rows Home creates by itself are ordinary sections flagged `auto`.

const item = (id, over = {}) => ({ id, name: `Item ${id}`, price: 10, available: 1, shopIsOpen: 1, shop_is_open: 1, ...over });
const sellable = (id) => item(id);
const closedShopItem = (id) => item(id, { shopIsOpen: 0, shop_is_open: 0 });
const outOfStock = (id) => item(id, { available: 0 });

const manual = (id, items, sectionType = 'product_block') => ({ id, title: `manual ${id}`, sectionType, items });
const auto = (id, allUnavailable = false) => ({
  id, title: `auto ${id}`, sectionType: 'product_block', auto: true, autoKind: 'shop', sourceId: id, allUnavailable, items: [],
});

const ids = (units) => units.map((u) => (u.kind === 'auto' ? u.auto.id : u.section.id));
const kinds = (units) => units.map((u) => u.kind);

describe('orderHomeUnits', () => {
  it('keeps the admin\'s order exactly when everything has something available', () => {
    const sections = [
      manual(1, [], 'offer_banner'),
      manual(2, [sellable(1)]),
      manual(3, [sellable(2)]),
      auto(10),
      auto(11),
    ];
    const units = orderHomeUnits(sections);
    expect(ids(units)).toEqual([1, 2, 3, 10, 11]);
    expect(kinds(units)).toEqual(['section', 'section', 'section', 'auto', 'auto']);
  });

  it('puts the admin\'s sections first and the automatic rows after them (the default admin order)', () => {
    const units = orderHomeUnits([manual(1, [sellable(1)]), manual(2, [sellable(2)]), auto(10), auto(11)]);
    expect(kinds(units)).toEqual(['section', 'section', 'auto', 'auto']);
  });

  it('follows the admin when an automatic row was dragged above a manual section', () => {
    expect(ids(orderHomeUnits([manual(1, [sellable(1)]), auto(10), manual(2, [sellable(2)]), auto(11)]))).toEqual([1, 10, 2, 11]);
  });

  it('moves every section with NOTHING available to the very end, keeping the admin order inside each group', () => {
    const sections = [
      manual(1, [sellable(1)]),        // available
      auto(10, true),                  // nothing available
      manual(2, [closedShopItem(2)]),  // nothing available
      auto(11, false),                 // available
      manual(3, [sellable(3)]),        // available
      auto(12, true),                  // nothing available
    ];
    expect(ids(orderHomeUnits(sections))).toEqual([1, 11, 3, 10, 2, 12]);
  });

  it('a section counts as unavailable only when EVERY item is (one sellable item keeps it in place)', () => {
    const mixed = manual(2, [outOfStock(1), sellable(2), closedShopItem(3)]);
    expect(isSectionAllUnavailable(mixed)).toBe(false);
    expect(ids(orderHomeUnits([manual(1, [sellable(1)]), mixed, manual(3, [sellable(3)])]))).toEqual([1, 2, 3]);
  });

  it('shop closed (everything unavailable): the page is still just the admin\'s order, top to bottom', () => {
    const sections = [
      manual(1, [], 'offer_banner'),
      manual(2, [], 'category_grid'),
      manual(3, [closedShopItem(1), outOfStock(2)]),
      manual(4, [closedShopItem(3)]),
      auto(10, true),
      auto(11, true),
      auto(12, true),
    ];
    const units = orderHomeUnits(sections);
    expect(ids(units)).toEqual([1, 2, 3, 4, 10, 11, 12]);
    expect(kinds(units)).toEqual(['section', 'section', 'section', 'section', 'auto', 'auto', 'auto']);
  });

  it('shop closed with the admin\'s sections first: manual sections still come before the automatic rows', () => {
    // Banner and category grid have no products to be unavailable, so they stay
    // with the available group; the rest is unavailable, in admin order.
    const sections = [manual(1, [], 'offer_banner'), manual(2, [outOfStock(1)]), auto(10, true), manual(3, [outOfStock(2)]), auto(11, true)];
    expect(ids(orderHomeUnits(sections))).toEqual([1, 2, 10, 3, 11]);
  });

  it('never treats banners, category grids or empty sections as unavailable', () => {
    expect(isSectionAllUnavailable(manual(1, [], 'offer_banner'))).toBe(false);
    expect(isSectionAllUnavailable(manual(2, [], 'category_grid'))).toBe(false);
    expect(isSectionAllUnavailable(manual(3, []))).toBe(false);
  });

  it('is stable — the same sections always give the same order (nothing reshuffles)', () => {
    const sections = [manual(1, [closedShopItem(1)]), auto(10, true), manual(2, [sellable(2)]), auto(11, false)];
    expect(ids(orderHomeUnits(sections))).toEqual(ids(orderHomeUnits(sections)));
    expect(ids(orderHomeUnits(sections))).toEqual([2, 11, 1, 10]);
  });

  it('handles no sections', () => {
    expect(orderHomeUnits([])).toEqual([]);
    expect(orderHomeUnits(undefined)).toEqual([]);
  });
});
