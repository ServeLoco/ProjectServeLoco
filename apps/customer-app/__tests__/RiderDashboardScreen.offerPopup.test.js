/**
 * What the dashboard hands its slide-to-accept popup around an offer that is
 * settled elsewhere:
 *  - Accepted on the floating card: the app opens before that accept lands,
 *    so the offer stays out of the popup meanwhile (it used to flash there).
 *  - Already settled on the server (accepted from the card, expired,
 *    withdrawn): a slide or reject gets 409/404, and the dashboard drops the
 *    offer and resyncs rather than throw — throwing left the popup up with a
 *    slider the server would keep refusing.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

let popupProps = null;

jest.mock('../src/screens/rider/RiderOfferPopup', () => {
  const PopupStub = (props) => {
    popupProps = props;
    return null;
  };
  return PopupStub;
});

jest.mock('../src/api', () => ({
  riderApi: {
    getMe: jest.fn(),
    getActiveOffer: jest.fn(),
    acceptOffer: jest.fn(),
    rejectOffer: jest.fn(),
    setOnline: jest.fn(),
  },
  subscribeRealtime: () => () => {},
}));

jest.mock('../src/stores', () => {
  const state = { rider: { id: 1, isOnline: true }, setRider: () => {} };
  return { useAuthStore: (selector) => selector(state) };
});

jest.mock('@react-navigation/native', () => {
  const ReactLib = require('react');
  return {
    useFocusEffect: (cb) => ReactLib.useEffect(cb, [cb]),
    useIsFocused: () => true,
  };
});

jest.mock('../src/hooks/useRiderOfferAlert', () => ({ useRiderOfferAlert: () => {} }));
jest.mock('../src/hooks/useRiderLocationTracking', () => ({ useRiderLocationTracking: () => {} }));
jest.mock('../src/hooks/useRiderIdleLocationPing', () => ({ useRiderIdleLocationPing: () => {} }));
jest.mock('../src/hooks/useRiderBackgroundLocationTracking', () => ({
  useRiderBackgroundLocationTracking: () => ({
    disclosureVisible: false,
    onDisclosureAllow: () => {},
    onDisclosureDecline: () => {},
  }),
}));
jest.mock('../src/components/RiderBackgroundLocationDisclosure', () => ({
  RiderBackgroundLocationDisclosure: () => null,
}));
jest.mock('../src/utils/orderAlarmNotifications', () => ({
  markAppBackground: jest.fn(),
  markAppForeground: jest.fn(),
  markOfferHandledForeground: jest.fn(() => Promise.resolve()),
  cancelRiderOfferAlarm: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/utils/alarmSound', () => ({ stopAlarmSound: jest.fn() }));
// The real card-accept bookkeeping; only the native permission calls are faked.
jest.mock('../src/utils/overlayOfferCard', () => ({
  ...jest.requireActual('../src/utils/overlayOfferCard'),
  canShowOverlay: jest.fn(() => Promise.resolve(true)),
  requestOverlayPermission: jest.fn(),
}));

const { riderApi } = require('../src/api');
const { beginCardAccept, endCardAccept } = require('../src/utils/overlayOfferCard');
const RiderDashboardScreen = require('../src/screens/rider/RiderDashboardScreen').default;

function makeOffer(id) {
  return {
    id,
    offerId: id,
    orderId: 100 + id,
    orderNumber: `OD-${100 + id}`,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
}

function serverHas(offers, assignments = []) {
  return {
    me: { rider: { id: 1, isOnline: true }, activeOffers: offers, currentAssignments: assignments },
    active: { offer: offers[0] || null, offers },
  };
}

/** Every load from now on answers with this server state. */
function serverAnswers({ me, active }) {
  riderApi.getMe.mockResolvedValue(me);
  riderApi.getActiveOffer.mockResolvedValue(active);
}

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

let root;

async function mountShowing(offer) {
  serverAnswers(serverHas([offer]));
  await act(async () => {
    root = ReactTestRenderer.create(<RiderDashboardScreen navigation={{ navigate: jest.fn() }} />);
  });
  expect(popupProps.offer?.id).toBe(offer.id);
}

beforeEach(() => {
  jest.clearAllMocks();
  popupProps = null;
});

afterEach(async () => {
  if (root) {
    await act(async () => { root.unmount(); });
    root = null;
  }
});

// Card-accept bookkeeping is module state, so each test uses its own offer id.
describe('RiderDashboardScreen — offer accepted on the floating card', () => {
  it('keeps the offer out of the popup while the card accept is in flight', async () => {
    const offer = makeOffer(41);
    await mountShowing(offer);

    await act(async () => { beginCardAccept(String(offer.id)); });

    expect(popupProps.offer).toBeNull();
  });

  it('never brings it back once the accept landed, even from a refresh that left before it', async () => {
    const offer = makeOffer(42);
    await mountShowing(offer);
    await act(async () => { beginCardAccept(String(offer.id)); });

    // The refresh the accept triggers still answers with the offer open —
    // the stale-response case — and the popup must stay clear regardless.
    await act(async () => { endCardAccept(String(offer.id), true); });

    expect(riderApi.getMe).toHaveBeenCalled();
    expect(popupProps.offer).toBeNull();
  });

  it('gives the offer back to the popup when the card accept failed', async () => {
    const offer = makeOffer(43);
    await mountShowing(offer);
    await act(async () => { beginCardAccept(String(offer.id)); });
    expect(popupProps.offer).toBeNull();

    await act(async () => { endCardAccept(String(offer.id), false); });

    expect(popupProps.offer?.id).toBe(offer.id);
  });

  it('still shows other offers while one is being accepted on the card', async () => {
    const taken = makeOffer(44);
    const next = makeOffer(45);
    serverAnswers(serverHas([taken, next]));
    await act(async () => {
      root = ReactTestRenderer.create(<RiderDashboardScreen navigation={{ navigate: jest.fn() }} />);
    });
    expect(popupProps.offer?.id).toBe(taken.id);

    await act(async () => { beginCardAccept(String(taken.id)); });

    expect(popupProps.offer?.id).toBe(next.id);
    expect(popupProps.queueTotal).toBe(1);
  });
});

describe('RiderDashboardScreen — offer already settled on the server', () => {
  const offer = makeOffer(29);

  beforeEach(async () => {
    await mountShowing(offer);
    // Every later load: the server has it settled.
    serverAnswers(serverHas([], [{ id: offer.orderId, status: 'Preparing', orderNumber: offer.orderNumber }]));
  });

  it('drops the offer when a slide gets 409 "no longer pending"', async () => {
    riderApi.acceptOffer.mockRejectedValueOnce(apiError(409, 'Offer is no longer pending'));

    await act(async () => { await popupProps.onAccept(offer); });

    expect(riderApi.acceptOffer).toHaveBeenCalledWith(29);
    expect(popupProps.offer).toBeNull();
  });

  it('drops the offer when reject gets 404 (offer gone)', async () => {
    riderApi.rejectOffer.mockRejectedValueOnce(apiError(404, 'Offer not found'));

    await act(async () => { await popupProps.onReject(offer); });

    expect(popupProps.offer).toBeNull();
  });

  it('still surfaces a real failure so the popup can show it', async () => {
    serverAnswers(serverHas([offer]));
    riderApi.acceptOffer.mockRejectedValueOnce(apiError(0, 'Network request failed. Please try again.'));

    let thrown = null;
    await act(async () => {
      try {
        await popupProps.onAccept(offer);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown?.message).toBe('Network request failed. Please try again.');
    expect(popupProps.offer?.id).toBe(29);
  });
});
