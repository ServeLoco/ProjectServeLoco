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
