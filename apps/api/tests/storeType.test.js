jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

const { normalizeStoreType } = require('../src/utils/storeMode');

describe('Store Type Normalization', () => {
  it('handles type=all when allowed', async () => {
    await expect(normalizeStoreType('all', { allowAll: true })).resolves.toBe('all');
  });

  it('throws error for type=all when not allowed', async () => {
    await expect(normalizeStoreType('all', { allowAll: false })).rejects.toThrow('store_type "all" is not allowed in this context');
  });

  it('handles missing type with fallback', async () => {
    await expect(normalizeStoreType('', { fallback: 'packed' })).resolves.toBe('packed');
    await expect(normalizeStoreType(undefined, { fallback: 'fast_food' })).resolves.toBe('fast_food');
  });

  it('normalizes packed and fast_food', async () => {
    await expect(normalizeStoreType('packed', {})).resolves.toBe('packed');
    await expect(normalizeStoreType('packed_items', {})).resolves.toBe('packed');
    await expect(normalizeStoreType('Fast Food', {})).resolves.toBe('fast_food');
  });
});
