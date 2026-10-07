/**
 * An offer the server has already settled (accepted from the floating card,
 * expired, withdrawn) answers a slide or reject with 409/404. The dashboard
 * must drop it and resync rather than throw — throwing left the popup up with
 * a slider the server would keep refusing.
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
jest.mock('../src/utils/overlayOfferCard', () => ({
  canShowOverlay: jest.fn(() => Promise.resolve(true)),
  requestOverlayPermission: jest.fn(),
}));

const { riderApi } = require('../src/api');
const RiderDashboardScreen = require('../src/screens/rider/RiderDashboardScreen').default;

const OFFER = {
  id: 29,
  offerId: 29,
  orderId: 142,
  orderNumber: 'OD-142',
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

describe('RiderDashboardScreen — offer already settled on the server', () => {
  let root;

  beforeEach(async () => {
    jest.clearAllMocks();
    popupProps = null;
    // First load: the offer is still waiting, so the popup shows it.
    riderApi.getMe.mockResolvedValueOnce({
      rider: { id: 1, isOnline: true },
      activeOffers: [OFFER],
      currentAssignments: [],
    });
    riderApi.getActiveOffer.mockResolvedValueOnce({ offer: OFFER, offers: [OFFER] });
    // Every later load: the server has it settled.
    riderApi.getMe.mockResolvedValue({
      rider: { id: 1, isOnline: true },
      activeOffers: [],
      currentAssignments: [{ id: 142, status: 'Preparing', orderNumber: 'OD-142' }],
    });
    riderApi.getActiveOffer.mockResolvedValue({ offer: null, offers: [] });

    await act(async () => {
      root = ReactTestRenderer.create(<RiderDashboardScreen navigation={{ navigate: jest.fn() }} />);
    });
    expect(popupProps.offer?.id).toBe(29);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
  });

  it('drops the offer when a slide gets 409 "no longer pending"', async () => {
    riderApi.acceptOffer.mockRejectedValueOnce(apiError(409, 'Offer is no longer pending'));

    await act(async () => { await popupProps.onAccept(OFFER); });

    expect(riderApi.acceptOffer).toHaveBeenCalledWith(29);
    expect(popupProps.offer).toBeNull();
  });

  it('drops the offer when reject gets 404 (offer gone)', async () => {
    riderApi.rejectOffer.mockRejectedValueOnce(apiError(404, 'Offer not found'));

    await act(async () => { await popupProps.onReject(OFFER); });

    expect(popupProps.offer).toBeNull();
  });

  it('still surfaces a real failure so the popup can show it', async () => {
    riderApi.acceptOffer.mockRejectedValueOnce(apiError(0, 'Network request failed. Please try again.'));

    let thrown = null;
    await act(async () => {
      try {
        await popupProps.onAccept(OFFER);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown?.message).toBe('Network request failed. Please try again.');
    expect(popupProps.offer?.id).toBe(29);
  });
});
