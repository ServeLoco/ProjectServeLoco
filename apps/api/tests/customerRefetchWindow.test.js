/**
 * The suppression window that keeps one change from costing every phone in
 * an area two refetches. Exercises the real socket module (no mock), since
 * the recording happens inside emitToAllCustomers itself.
 */
const { emitToAllCustomers, customerRefetchPushedSince } = require('../src/realtime/socket');

describe('customerRefetchPushedSince', () => {
  it('records events the app answers with a refetch', () => {
    emitToAllCustomers(901, 'shop.status.updated', { shopId: 1, isOpen: true });
    expect(customerRefetchPushedSince(901, 6000)).toBe(true);
  });

  it('ignores events the app patches in place', () => {
    emitToAllCustomers(902, 'product.availability.updated', { productId: 1, available: false });
    expect(customerRefetchPushedSince(902, 6000)).toBe(false);
  });

  it('scopes the window to one area', () => {
    emitToAllCustomers(903, 'shop.status.updated', { shopId: 1, isOpen: false });
    expect(customerRefetchPushedSince(904, 6000)).toBe(false);
  });

  it('expires', () => {
    emitToAllCustomers(905, 'shop.status.updated', { shopId: 1, isOpen: false });
    expect(customerRefetchPushedSince(905, 0)).toBe(false);
  });

  it('matches a string areaId to the number the emit used', () => {
    emitToAllCustomers(906, 'shop.status.updated', { shopId: 1, isOpen: false });
    expect(customerRefetchPushedSince('906', 6000)).toBe(true);
  });
});
