import { isShopRejected } from '../src/utils/riderOrderActions';

describe('isShopRejected', () => {
  it('reads a shop pin status from the API', () => {
    expect(isShopRejected({ id: 2, status: 'rejected' })).toBe(true);
    expect(isShopRejected({ id: 1, status: 'accepted' })).toBe(false);
    expect(isShopRejected({ id: 3, status: 'pending' })).toBe(false);
  });

  it('reads the rejected flag on shops and order items', () => {
    expect(isShopRejected({ rejected: true })).toBe(true);
    expect(isShopRejected({ rejected: false, accepted: true })).toBe(false);
  });

  it('treats data from an older API (no status fields) as not rejected', () => {
    expect(isShopRejected({ id: 1, name: 'Shop A' })).toBe(false);
    expect(isShopRejected(null)).toBe(false);
    expect(isShopRejected(undefined)).toBe(false);
  });
});
