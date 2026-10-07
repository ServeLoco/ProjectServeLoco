/**
 * The floating card's Accept handler (index.js). It opens the app before the
 * accept call lands, so it has to mark the offer first — or the dashboard
 * flashes that offer as its slide-to-accept popup — and then report how the
 * call ended, so the dashboard can drop the offer or hand it back.
 */
import { Platform } from 'react-native';

const calls = [];
let overlayHandler = null;

jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));
jest.mock('../App', () => () => null);
jest.mock('../src/screens/rider/RiderAlarmScreen', () => () => null);
jest.mock('../src/tasks/riderBackgroundLocationTask', () => ({}));
jest.mock('../src/utils/crashReporting', () => ({
  initCrashReporting: jest.fn(),
  installConsoleCapture: jest.fn(),
  recordHandledError: jest.fn(),
  logBreadcrumb: jest.fn(),
}));
jest.mock('../src/utils/overlayOfferCard', () => ({
  subscribeOverlayAction: (cb) => { overlayHandler = cb; return () => {}; },
  openMainApp: jest.fn(() => calls.push('open')),
  beginCardAccept: jest.fn((id) => calls.push(`begin:${id}`)),
  endCardAccept: jest.fn((id, accepted) => calls.push(`end:${id}:${accepted}`)),
}));
jest.mock('../src/utils/orderAlarmNotifications', () => ({
  handleBackgroundAlarmMessage: jest.fn(),
  handleAlarmActionEvent: jest.fn(),
  isAlarmPayload: jest.fn(() => false),
  performOfferAction: jest.fn(),
  ALERT_TYPE_NEW_ORDER: 'new_order_alarm',
  ALERT_TYPE_RIDER_OFFER: 'rider_offer_alarm',
}));

const { performOfferAction } = require('../src/utils/orderAlarmNotifications');
const { beginCardAccept, endCardAccept, openMainApp } = require('../src/utils/overlayOfferCard');

describe('index.js floating-card action handler', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    // index.js wires its handlers at import time, on Android only.
    Platform.OS = 'android';
    require('../index');
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  it('marks a rider offer before opening the app, then reports the accept landed', async () => {
    performOfferAction.mockImplementation(async () => { calls.push('accept'); return true; });

    await overlayHandler({ action: 'accept', offerId: '29', orderId: '142' });

    expect(calls).toEqual(['begin:29', 'open', 'accept', 'end:29:true']);
    expect(performOfferAction).toHaveBeenCalledWith('rider_offer_alarm', 'accept', expect.objectContaining({ offerId: '29' }));
  });

  it('reports a failed accept so the offer goes back to the popup', async () => {
    performOfferAction.mockResolvedValue(false);

    await overlayHandler({ action: 'accept', offerId: '30', orderId: '143' });

    expect(endCardAccept).toHaveBeenCalledWith('30', false);
  });

  it('still releases the offer if the accept path throws', async () => {
    performOfferAction.mockRejectedValue(new Error('boom'));

    await overlayHandler({ action: 'accept', offerId: '31', orderId: '144' });

    expect(endCardAccept).toHaveBeenCalledWith('31', false);
  });

  it('leaves reject and shop orders alone', async () => {
    performOfferAction.mockResolvedValue(true);

    await overlayHandler({ action: 'reject', offerId: '32', orderId: '145' });
    await overlayHandler({ action: 'accept', orderId: '146' });

    expect(beginCardAccept).not.toHaveBeenCalled();
    expect(endCardAccept).not.toHaveBeenCalled();
    expect(openMainApp).toHaveBeenCalledTimes(1);
  });
});
