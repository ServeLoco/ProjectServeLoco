const { normalizeStoreType } = require('../src/utils/storeMode');

describe('Store Type Normalization', () => {
  it('handles type=all when allowed', () => {
    expect(normalizeStoreType('all', { allowAll: true })).toBe('all');
  });

  it('throws error for type=all when not allowed', () => {
    expect(() => normalizeStoreType('all', { allowAll: false })).toThrow('store_type "all" is not allowed in this context');
  });

  it('handles missing type with fallback', () => {
    expect(normalizeStoreType('', { fallback: 'packed' })).toBe('packed');
    expect(normalizeStoreType(undefined, { fallback: 'fast_food' })).toBe('fast_food');
  });

  it('normalizes packed and fast_food', () => {
    expect(normalizeStoreType('packed', {})).toBe('packed');
    expect(normalizeStoreType('packed_items', {})).toBe('packed');
    expect(normalizeStoreType('Fast Food', {})).toBe('fast_food');
  });
});
