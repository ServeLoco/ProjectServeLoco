/**
 * When a shop closes mid-session (shop.status.updated realtime push, see
 * useShopStatusSync), any cart lines belonging to that shop must be dropped
 * automatically — otherwise the item sits in the cart looking orderable
 * until checkout rejects it.
 */

import { useCartStore } from '../src/stores';

const product = (overrides) => ({
  id: 1,
  name: 'Test product',
  price: 100,
  shopId: 'shop-1',
  ...overrides,
});

beforeEach(() => {
  useCartStore.setState({ items: [] });
});

describe('useCartStore.removeItemsByShop', () => {
  it('removes cart lines whose product belongs to the closed shop', () => {
    useCartStore.getState().addItem(product({ id: 1 }));
    useCartStore.getState().addItem(product({ id: 2, shopId: 'shop-2' }));

    const removed = useCartStore.getState().removeItemsByShop('shop-1');

    expect(removed).toHaveLength(1);
    expect(removed[0].product.id).toBe(1);
    const remainingIds = useCartStore.getState().items.map(i => i.product.id);
    expect(remainingIds).toEqual([2]);
  });

  it('matches shop_id (snake_case) as well as shopId', () => {
    useCartStore.getState().addItem(product({ id: 3, shopId: undefined, shop_id: 'shop-1' }));

    const removed = useCartStore.getState().removeItemsByShop('shop-1');

    expect(removed).toHaveLength(1);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('leaves house products (no shopId) and other shops untouched', () => {
    useCartStore.getState().addItem(product({ id: 4, shopId: null }));
    useCartStore.getState().addItem(product({ id: 5, shopId: 'shop-2' }));

    const removed = useCartStore.getState().removeItemsByShop('shop-1');

    expect(removed).toHaveLength(0);
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('returns an empty array (no-op) when nothing matches', () => {
    useCartStore.getState().addItem(product({ id: 6, shopId: 'shop-9' }));
    expect(useCartStore.getState().removeItemsByShop('shop-1')).toEqual([]);
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

describe('useCartStore.syncItemPricesFromServer', () => {
  it('updates stale product prices from server cart/calculate line items', () => {
    useCartStore.getState().addItem(product({ id: 10, price: 50 }), 2);
    useCartStore.getState().addItem(product({ id: 11, price: 30 }), 1);

    const changed = useCartStore.getState().syncItemPricesFromServer([
      { id: 10, unitPrice: 80, type: 'product', variantId: null },
      { id: 11, unitPrice: 30, type: 'product', variantId: null },
    ]);

    expect(changed).toBe(true);
    const items = useCartStore.getState().items;
    expect(items.find((i) => String(i.product.id) === '10').product.price).toBe(80);
    expect(items.find((i) => String(i.product.id) === '11').product.price).toBe(30);
    // Sticky mini-cart totals sum variant/product price × qty from store lines
    const stickyTotal = items.reduce(
      (sum, item) => sum + (Number(item.variant?.price ?? item.product?.price) || 0) * (Number(item.quantity) || 0),
      0,
    );
    expect(stickyTotal).toBe(80 * 2 + 30);
  });

  it('updates variant line prices without touching other variants of the same product', () => {
    const base = product({ id: 20, price: 40 });
    useCartStore.getState().addItem(base, 1, { id: 1, label: 'Small', price: 40 });
    useCartStore.getState().addItem(base, 1, { id: 2, label: 'Large', price: 60 });

    useCartStore.getState().syncItemPricesFromServer([
      { id: 20, unitPrice: 55, type: 'product', variantId: 1 },
      { id: 20, unitPrice: 60, type: 'product', variantId: 2 },
    ]);

    const items = useCartStore.getState().items;
    const small = items.find((i) => i.variant?.id === 1);
    const large = items.find((i) => i.variant?.id === 2);
    expect(small.variant.price).toBe(55);
    expect(large.variant.price).toBe(60);
  });

  it('is a no-op when prices already match (avoids re-render loops)', () => {
    useCartStore.getState().addItem(product({ id: 30, price: 99 }), 1);
    const before = useCartStore.getState().items;

    const changed = useCartStore.getState().syncItemPricesFromServer([
      { id: 30, unitPrice: 99, type: 'product' },
    ]);

    expect(changed).toBe(false);
    expect(useCartStore.getState().items).toBe(before);
  });
});
