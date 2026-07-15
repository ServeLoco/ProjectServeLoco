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

  it('never overwrites quantity when syncing server prices', () => {
    useCartStore.getState().addItem(product({ id: 40, price: 10 }), 5);
    useCartStore.getState().syncItemPricesFromServer([
      { id: 40, unitPrice: 25, type: 'product', quantity: 1 },
    ]);
    const line = useCartStore.getState().items[0];
    expect(line.quantity).toBe(5);
    expect(line.product.price).toBe(25);
  });

  it('applyCatalogProductPrices updates price and keeps quantity', () => {
    useCartStore.getState().addItem(product({ id: 50, price: 20 }), 3);
    const changed = useCartStore.getState().applyCatalogProductPrices([
      { id: 50, price: 35, available: true, name: 'Updated' },
    ]);
    expect(changed).toBe(true);
    const line = useCartStore.getState().items[0];
    expect(line.quantity).toBe(3);
    expect(line.product.price).toBe(35);
    expect(line.product.name).toBe('Updated');
    const sticky = line.product.price * line.quantity;
    expect(sticky).toBe(105);
  });

  it('applyCatalogProductPrices updates variant line prices by variant id', () => {
    const base = product({ id: 60, price: 40 });
    useCartStore.getState().addItem(base, 2, { id: 7, label: 'Large', price: 40 });
    useCartStore.getState().applyCatalogProductPrices([
      {
        id: 60,
        price: 40,
        variants: [{ id: 7, label: 'Large', price: 70, available: true }],
      },
    ]);
    const line = useCartStore.getState().items[0];
    expect(line.quantity).toBe(2);
    expect(line.variant.price).toBe(70);
    expect(line.variant.price * line.quantity).toBe(140);
  });
});

describe('useCartStore.removeUnavailableItems', () => {
  it('removes OOS product lines returned by cart/calculate unavailableItems', () => {
    useCartStore.getState().addItem(product({ id: 70, price: 50 }), 2);
    useCartStore.getState().addItem(product({ id: 71, price: 20 }), 1);

    const removed = useCartStore.getState().removeUnavailableItems([
      { productId: 70, type: 'product', reason: 'product_unavailable' },
    ]);

    expect(removed).toHaveLength(1);
    expect(String(removed[0].product.id)).toBe('70');
    expect(useCartStore.getState().items.map((i) => String(i.product.id))).toEqual(['71']);
  });

  it('removes only the matching variant line when variantId is set', () => {
    const base = product({ id: 80, price: 40 });
    useCartStore.getState().addItem(base, 1, { id: 1, label: 'Small', price: 40 });
    useCartStore.getState().addItem(base, 1, { id: 2, label: 'Large', price: 60 });

    const removed = useCartStore.getState().removeUnavailableItems([
      { productId: 80, variantId: 1, type: 'product', reason: 'variant_unavailable' },
    ]);

    expect(removed).toHaveLength(1);
    expect(removed[0].variant.id).toBe(1);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].variant.id).toBe(2);
  });

  it('drops all variants when product-level OOS has no variantId', () => {
    const base = product({ id: 90, price: 40 });
    useCartStore.getState().addItem(base, 1, { id: 1, label: 'Small', price: 40 });
    useCartStore.getState().addItem(base, 1, { id: 2, label: 'Large', price: 60 });

    const removed = useCartStore.getState().removeUnavailableItems([
      { productId: 90, type: 'product' },
    ]);

    expect(removed).toHaveLength(2);
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
