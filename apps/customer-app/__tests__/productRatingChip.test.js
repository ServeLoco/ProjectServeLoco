/**
 * Product card rating: the ratings store (one fetch per area, mapped by
 * product / combo id) and the chip ProductCard draws from it.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../src/api/productsApi', () => ({
  productsApi: { getRatings: jest.fn() },
}));

const { productsApi } = require('../src/api/productsApi');
const { useProductRatingsStore } = require('../src/stores/useProductRatingsStore');
const { useDeliveryLocationStore } = require('../src/stores/useDeliveryLocationStore');
const ProductCard = require('../src/components/ProductCard').default;

const ratingsResponse = {
  data: {
    areaId: 1,
    items: [
      { itemType: 'product', productId: 7, rating: 4, fire: false },
      { itemType: 'product', productId: 8, rating: 5, fire: true },
      { item_type: 'combo', product_id: 3, rating: 4.9, fire: true },
    ],
  },
};

const resetStores = () => {
  useProductRatingsStore.setState({ byKey: {}, loadedFor: null, nextLoadAt: 0, loading: false });
  useDeliveryLocationStore.setState({ coords: { lat: 29.44, lng: 75.66 }, areaId: 1 });
};

const findByLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label);

describe('useProductRatingsStore.ensureLoaded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
  });

  it('fetches once for the area and maps products and combos by id', async () => {
    productsApi.getRatings.mockResolvedValue(ratingsResponse);

    await useProductRatingsStore.getState().ensureLoaded();
    await useProductRatingsStore.getState().ensureLoaded();

    expect(productsApi.getRatings).toHaveBeenCalledTimes(1);
    expect(productsApi.getRatings).toHaveBeenCalledWith({ latitude: 29.44, longitude: 75.66 });
    expect(useProductRatingsStore.getState().byKey).toEqual({
      'product:7': { rating: 4, fire: false },
      'product:8': { rating: 5, fire: true },
      'combo:3': { rating: 4.9, fire: true },
    });
  });

  it('refetches when the area changes', async () => {
    productsApi.getRatings.mockResolvedValue(ratingsResponse);

    await useProductRatingsStore.getState().ensureLoaded();
    useDeliveryLocationStore.setState({ areaId: 2 });
    await useProductRatingsStore.getState().ensureLoaded();

    expect(productsApi.getRatings).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a delivery pin', async () => {
    useDeliveryLocationStore.setState({ coords: null });

    await useProductRatingsStore.getState().ensureLoaded();

    expect(productsApi.getRatings).not.toHaveBeenCalled();
  });

  it('keeps going after a failed fetch', async () => {
    productsApi.getRatings.mockRejectedValue(new Error('offline'));

    await expect(useProductRatingsStore.getState().ensureLoaded()).resolves.toBeUndefined();
    expect(useProductRatingsStore.getState().loading).toBe(false);
  });
});

describe('ProductCard rating chip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
    // Area 1 already loaded: the card's mount check must not fetch again.
    useProductRatingsStore.setState({ loadedFor: 'area:1', nextLoadAt: Date.now() + 60_000 });
  });

  let mounted = null;

  afterEach(() => {
    expect(productsApi.getRatings).not.toHaveBeenCalled();
    // Unmount so this card's store subscription can't react to the next
    // test's resets outside act().
    if (mounted) act(() => mounted.unmount());
    mounted = null;
  });

  const renderCard = (product) => {
    act(() => {
      mounted = renderer.create(<ProductCard product={{ name: 'Item', price: 40, available: true, ...product }} />);
    });
    return mounted;
  };

  it('shows ★ with the rating', () => {
    useProductRatingsStore.setState({ byKey: { 'product:7': { rating: 4, fire: false } } });
    const tree = renderCard({ id: '7' });
    expect(findByLabel(tree, 'Rated 4.0 out of 5').length).toBeGreaterThan(0);
  });

  it('shows the fire chip above 4.8', () => {
    useProductRatingsStore.setState({ byKey: { 'product:8': { rating: 5, fire: true } } });
    const tree = renderCard({ id: 8 });
    expect(findByLabel(tree, 'Top rated, 5.0 out of 5').length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('🔥');
  });

  it('reads a combo by its combo id', () => {
    useProductRatingsStore.setState({ byKey: { 'combo:3': { rating: 4.9, fire: true }, 'product:3': { rating: 3.5, fire: false } } });
    const tree = renderCard({ id: 3, isCombo: true });
    expect(findByLabel(tree, 'Top rated, 4.9 out of 5').length).toBeGreaterThan(0);
  });

  it('shows no chip for a product without a delivered order', () => {
    const tree = renderCard({ id: 99 });
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/out of 5/);
  });
});
