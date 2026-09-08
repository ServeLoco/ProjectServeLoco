/**
 * Renders CartScreen for real and checks what the customer is actually told
 * about delivery — the source-assertion tests alongside this only prove the
 * expressions exist, not that they reach the screen.
 *
 * The bug: Cart quoted 300ms after focus regardless of whether a pin had been
 * resolved, and a coordinate-less quote comes back outOfRange: true, which is
 * indistinguishable from a pin genuinely outside every zone.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: View,
    SafeAreaProvider: View,
  };
});
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('../src/api', () => ({
  cartApi: { calculate: jest.fn() },
}));
jest.mock('../src/hooks/useDeliveryLocationSync', () => ({
  syncDeliveryLocation: jest.fn(),
}));
jest.mock('../src/components/Toast', () => ({ showToast: jest.fn() }));

import CartScreen from '../src/screens/customer/CartScreen/CartScreen';

const { cartApi } = require('../src/api');
const { syncDeliveryLocation } = require('../src/hooks/useDeliveryLocationSync');
const { useCartStore } = require('../src/stores/useCartStore');
const { useDeliveryLocationStore } = require('../src/stores/useDeliveryLocationStore');
const { useSettingsStore } = require('../src/stores/useSettingsStore');

const ITEM = {
  product: { id: 1, name: 'Milk 1L', price: 100, available: true },
  quantity: 2,
  type: 'product',
  variant: null,
};

/** A normal, deliverable, zone-priced quote. */
const ZONE_BILL = {
  subtotal: 200, deliveryCharge: 55, nightCharge: 0, rainCharge: 0, fastDeliveryFee: 0,
  discount: 0, itemDiscount: 0, grandTotal: 255, items: [], unavailableItems: [],
  outOfRange: false, excluded: false, requiresLocation: false, deliveryWithinRange: true,
  isFreeDeliveryApplied: false, appliedCoupon: null,
};

/** What the server sends back when the request carried no coordinates. */
const NO_COORDS_BILL = {
  ...ZONE_BILL,
  deliveryCharge: 0, grandTotal: 200,
  outOfRange: true, requiresLocation: true, deliveryWithinRange: false,
};

/** A pin that really is outside every zone — must still be refused. */
const OUT_OF_ZONE_BILL = {
  ...ZONE_BILL,
  deliveryCharge: 0, grandTotal: 200,
  outOfRange: true, requiresLocation: false, deliveryWithinRange: false,
  nearestZoneName: 'Zone A',
};

function visibleText(root) {
  return root.findAll((n) => n.type === 'Text' && n.props.children !== undefined)
    .map((n) => {
      const flatten = (c) => (Array.isArray(c) ? c.map(flatten).join('') : String(c ?? ''));
      return flatten(n.props.children);
    })
    .join(' | ');
}

async function renderCart() {
  let tree;
  await act(async () => {
    tree = ReactTestRenderer.create(<CartScreen />);
  });
  // Clear the 300ms bill debounce.
  await act(async () => { jest.advanceTimersByTime(400); });
  return tree;
}

describe('CartScreen tells the customer the truth about their location', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCartStore.setState({
      items: [ITEM], appliedCouponCode: null, appliedCouponId: null, appliedCoupon: null,
      couponAutoApplyDisabled: false,
    });
    useSettingsStore.setState({ shopStatus: 'open' });
    useDeliveryLocationStore.setState({
      coords: null, source: null, insideZone: null, zoneName: null, zoneId: null,
      isInitialSyncComplete: false,
    });
  });

  afterEach(() => { jest.useRealTimers(); });

  it('CONTROL: quotes the zone delivery charge for a resolved in-zone pin', async () => {
    useDeliveryLocationStore.setState({
      coords: { lat: 12.97, lng: 77.6 }, isInitialSyncComplete: true,
    });
    cartApi.calculate.mockResolvedValue(ZONE_BILL);

    const tree = await renderCart();
    const text = visibleText(tree.root);

    expect(cartApi.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 12.97, longitude: 77.6 }),
    );
    expect(text).toContain('₹55');
    expect(text).not.toContain('Outside delivery area');
    expect(text).toContain('Proceed to Pay');
  });

  it('does not quote at all while the startup location sync is still running', async () => {
    // coords null, isInitialSyncComplete false — a first launch mid-sync.
    cartApi.calculate.mockResolvedValue(NO_COORDS_BILL);

    const tree = await renderCart();

    // The request that produced the false "outside delivery area" verdict is
    // simply never sent.
    expect(cartApi.calculate).not.toHaveBeenCalled();
    expect(visibleText(tree.root)).not.toContain('Outside delivery area');
  });

  it('says the location is missing, not that the customer is out of area', async () => {
    // The sync finished having stored no pin — the slow-connection outcome.
    useDeliveryLocationStore.setState({ coords: null, isInitialSyncComplete: true });
    cartApi.calculate.mockResolvedValue(NO_COORDS_BILL);

    const tree = await renderCart();
    const text = visibleText(tree.root);

    expect(text).toContain("Couldn't get your location");
    expect(text).not.toContain('Outside delivery area');
    expect(text).toContain('Set delivery location');
  });

  it('retries the location sync when the cart is opened without a pin', async () => {
    useDeliveryLocationStore.setState({ coords: null, isInitialSyncComplete: true });
    cartApi.calculate.mockResolvedValue(NO_COORDS_BILL);

    await renderCart();

    expect(syncDeliveryLocation).toHaveBeenCalledTimes(1);
  });

  // A bare skeleton past a couple of seconds reads as the app being stuck,
  // and on a slow link the wait is doubled: the startup location sync has to
  // land before the quote may even be sent.
  describe('a slow bill fetch says so instead of just spinning', () => {
    /**
     * Two separate act()s on purpose: the 2500ms notice timer is only armed
     * by the render that follows isCalculating flipping true, and that flip
     * is itself behind the 300ms bill debounce. Advancing both in one act
     * arms the timer at the far end of the window, so it never fires.
     */
    async function renderThenWait(ms) {
      let tree;
      await act(async () => { tree = ReactTestRenderer.create(<CartScreen />); });
      await act(async () => { jest.advanceTimersByTime(400); }); // debounce -> isCalculating
      await act(async () => { jest.advanceTimersByTime(ms); }); // the notice window
      return tree;
    }

    it('says nothing for the first 2.5s — a normal fetch must stay quiet', async () => {
      cartApi.calculate.mockResolvedValue(NO_COORDS_BILL); // sync still running

      const tree = await renderThenWait(2000);

      expect(visibleText(tree.root)).not.toContain('Slow internet');
    });

    it('names the connection once the wait passes 2.5s', async () => {
      cartApi.calculate.mockResolvedValue(NO_COORDS_BILL);

      const tree = await renderThenWait(3000);

      expect(visibleText(tree.root)).toContain('Slow internet');
      // Still a wait, never a verdict — the refusal copy must not appear.
      expect(visibleText(tree.root)).not.toContain('Outside delivery area');
    });

    it('CONTROL: a bill that arrives never shows the notice, however long the screen stays open', async () => {
      useDeliveryLocationStore.setState({
        coords: { lat: 12.97, lng: 77.6 }, isInitialSyncComplete: true,
      });
      cartApi.calculate.mockResolvedValue(ZONE_BILL);

      const tree = await renderThenWait(5000);
      const text = visibleText(tree.root);

      expect(text).not.toContain('Slow internet');
      expect(text).toContain('₹55');
    });
  });

  it('REGRESSION: a pin genuinely outside every zone is still refused', async () => {
    useDeliveryLocationStore.setState({
      coords: { lat: 25.0, lng: 80.0 }, isInitialSyncComplete: true,
    });
    cartApi.calculate.mockResolvedValue(OUT_OF_ZONE_BILL);

    const tree = await renderCart();
    const text = visibleText(tree.root);

    expect(text).toContain('Outside delivery area');
    expect(text).not.toContain("Couldn't get your location");
    expect(text).toContain('Delivery not available here');
    // The refused ₹0 must never read as a free delivery perk.
    expect(text).not.toContain('FREE');
  });
});
