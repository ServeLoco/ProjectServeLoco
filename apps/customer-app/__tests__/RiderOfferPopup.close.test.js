/**
 * RiderOfferPopup must close once its offer is gone, however the slide-down
 * ends. An offer that arrived while the app was minimised and was then
 * accepted from the floating card had its slide-down cut off
 * (`finished: false`) as the app came back, and the sheet froze on that
 * offer — reproduced on a real phone, where the rider's slide then got
 * "Offer is no longer pending" from the server.
 */
import React from 'react';
import { Animated } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import RiderOfferPopup from '../src/screens/rider/RiderOfferPopup';

function makeOffer(id, orderNumber) {
  return {
    id,
    offerId: id,
    orderId: 500 + id,
    orderNumber,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    offerTimeoutSec: 300,
    items: [],
    shops: [],
  };
}

function isDrawing(root, orderNumber) {
  return root.findAll((n) => n.type === 'Text'
    && [].concat(n.props.children).join('') === `Order #${orderNumber}`).length > 0;
}

/** How the next slide-down ends: 'cut' (finished: false), 'lost' (never), 'done'. */
let closeOutcome = 'done';

describe('RiderOfferPopup closing', () => {
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    closeOutcome = 'done';
    const realTiming = Animated.timing;
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      // Only the sheet's slide-down is faked; the countdown bar and the
      // slider's arrow keep the real animation.
      if (config.toValue !== 0 || config.duration !== 220) return realTiming(value, config);
      return {
        start: (cb) => {
          if (closeOutcome === 'cut') cb({ finished: false });
          if (closeOutcome === 'done') cb({ finished: true });
        },
        stop: jest.fn(),
        reset: jest.fn(),
      };
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function renderWith(offer) {
    await act(async () => {
      if (!root) {
        root = ReactTestRenderer.create(
          <RiderOfferPopup offer={offer} onAccept={jest.fn()} onReject={jest.fn()} />,
        );
      } else {
        root.update(
          <RiderOfferPopup offer={offer} onAccept={jest.fn()} onReject={jest.fn()} />,
        );
      }
    });
  }

  it('closes after a normal slide-down', async () => {
    await renderWith(makeOffer(29, 'OD-29'));
    expect(isDrawing(root.root, 'OD-29')).toBe(true);

    await renderWith(null);
    expect(isDrawing(root.root, 'OD-29')).toBe(false);
  });

  it('closes when the slide-down is cut off (finished: false)', async () => {
    await renderWith(makeOffer(29, 'OD-29'));
    closeOutcome = 'cut';

    await renderWith(null);
    expect(isDrawing(root.root, 'OD-29')).toBe(false);
  });

  it('closes even if the slide-down never reports back', async () => {
    await renderWith(makeOffer(29, 'OD-29'));
    closeOutcome = 'lost';

    await renderWith(null);
    expect(isDrawing(root.root, 'OD-29')).toBe(true);

    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(isDrawing(root.root, 'OD-29')).toBe(false);
  });

  it('keeps showing a new offer that lands while the old one slides away', async () => {
    await renderWith(makeOffer(29, 'OD-29'));
    closeOutcome = 'lost';

    await renderWith(null);
    await renderWith(makeOffer(30, 'OD-30'));
    await act(async () => { jest.advanceTimersByTime(1500); });

    expect(isDrawing(root.root, 'OD-30')).toBe(true);
    expect(isDrawing(root.root, 'OD-29')).toBe(false);
  });
});
