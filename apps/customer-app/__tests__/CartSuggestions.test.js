/**
 * The cart's "Add more" row: asks the server what goes with the cart, shows
 * it, adds from it, and stays out of the way when there is nothing to show.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/api', () => ({
  cartApi: { suggestions: jest.fn() },
}));
jest.mock('../src/api/analyticsClient', () => ({ trackEvent: jest.fn() }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

import CartSuggestions from '../src/components/CartSuggestions';

const { cartApi } = require('../src/api');
const { trackEvent } = require('../src/api/analyticsClient');
const { useCartStore } = require('../src/stores/useCartStore');
const { useDeliveryLocationStore } = require('../src/stores/useDeliveryLocationStore');

const BURGER = { product: { id: 3, name: 'Burger', price: 99, available: true }, quantity: 1, type: 'product', variant: null };
const COKE = { id: 1, name: 'Coke', price: '40.00', available: 1, categoryId: 10, variants: [] };
const FRIES = { id: 8, name: 'Fries', price: '79.00', available: 1, categoryId: 20, variants: [] };

const flush = async (ms = 0) => {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await act(async () => {});
};

// Unmounted after each test, or an earlier test's row would still be
// listening to the cart store and ask the server again.
const mounted = [];
async function renderRow() {
  let tree;
  await act(async () => {
    tree = ReactTestRenderer.create(<CartSuggestions />);
  });
  mounted.push(tree);
  await flush();
  return tree;
}

const cardNames = (tree) => tree.root
  .findAll((n) => n.type === 'Text')
  .map((n) => [].concat(n.props.children).join(''))
  .filter((text) => ['Coke', 'Fries'].includes(text));

describe('CartSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCartStore.setState({ items: [BURGER] });
    useDeliveryLocationStore.setState({ coords: { lat: 26.1, lng: 76.2 } });
    cartApi.suggestions.mockResolvedValue({ products: [COKE, FRIES] });
  });

  afterEach(() => {
    act(() => { mounted.splice(0).forEach((tree) => tree.unmount()); });
    jest.useRealTimers();
  });

  it('asks for what goes with the cart items and the delivery pin', async () => {
    await renderRow();
    expect(cartApi.suggestions).toHaveBeenCalledWith(expect.objectContaining({
      productIds: ['3'], latitude: 26.1, longitude: 76.2,
    }));
  });

  it('shows the suggested products and reports each one as shown once', async () => {
    const tree = await renderRow();
    expect(cardNames(tree)).toEqual(['Coke', 'Fries']);
    expect(trackEvent).toHaveBeenCalledWith('suggestion_impression', { productId: 1 });
    expect(trackEvent).toHaveBeenCalledWith('suggestion_impression', { productId: 8 });
  });

  it('adds a suggestion to the cart and keeps the card in place', async () => {
    const tree = await renderRow();
    const addButtons = tree.root.findAll((n) => n.props.accessibilityLabel === 'Add Coke to cart' && typeof n.props.onPress === 'function');
    await act(async () => { addButtons[0].props.onPress(); });
    await flush(1000);

    const lines = useCartStore.getState().items;
    expect(lines.map((line) => String(line.product.id))).toEqual(['3', '1']);
    expect(trackEvent).toHaveBeenCalledWith('suggestion_add', { productId: 1, price: 40 });
    // Adding from the row is not a reason to reload it.
    expect(cartApi.suggestions).toHaveBeenCalledTimes(1);
    expect(cardNames(tree)).toEqual(['Coke', 'Fries']);
  });

  it('asks again when the cart changes elsewhere', async () => {
    await renderRow();
    await act(async () => {
      useCartStore.setState({ items: [BURGER, { ...BURGER, product: { ...BURGER.product, id: 10, name: 'Matar Paneer' } }] });
    });
    await flush(500);
    expect(cartApi.suggestions).toHaveBeenLastCalledWith(expect.objectContaining({ productIds: ['3', '10'] }));
  });

  it('suggests for the row picks once the item they went with is removed', async () => {
    const tree = await renderRow();
    const addCoke = tree.root.findAll((n) => n.props.accessibilityLabel === 'Add Coke to cart' && typeof n.props.onPress === 'function');
    await act(async () => { addCoke[0].props.onPress(); });
    await flush(1000);
    expect(cartApi.suggestions).toHaveBeenCalledTimes(1);

    // The burger goes; only the Coke picked from the row is left.
    cartApi.suggestions.mockResolvedValue({ products: [FRIES] });
    await act(async () => {
      useCartStore.setState({ items: useCartStore.getState().items.filter((line) => String(line.product.id) !== '3') });
    });
    await flush(500);

    expect(cartApi.suggestions).toHaveBeenLastCalledWith(expect.objectContaining({ productIds: ['1'] }));
    expect(tree.toJSON()).not.toBeNull();
    expect(cardNames(tree)).toEqual(['Fries']);
  });

  it('draws nothing when there is nothing to suggest', async () => {
    cartApi.suggestions.mockResolvedValue({ products: [] });
    const tree = await renderRow();
    expect(tree.toJSON()).toBeNull();
  });

  it('draws nothing when the request fails', async () => {
    cartApi.suggestions.mockRejectedValue(new Error('offline'));
    const tree = await renderRow();
    expect(tree.toJSON()).toBeNull();
  });
});
