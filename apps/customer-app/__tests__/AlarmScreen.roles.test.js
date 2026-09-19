/**
 * The "alarm" RN root (AlarmActivity's only content) serves both roles: it is
 * the one activity that can draw over a keyguard, so a locked-phone shop alert
 * lands here too. Covers role resolution and the two different cards.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import notifee from '@notifee/react-native';

jest.mock('../src/api', () => ({
  riderApi: { getActiveOffer: jest.fn(), acceptOffer: jest.fn(), rejectOffer: jest.fn() },
  shopApi: { getMyOrders: jest.fn() },
}));

jest.mock('../src/utils/orderAlarmNotifications', () => ({
  ALERT_TYPE_NEW_ORDER: 'new_order_alarm',
  ALERT_TYPE_RIDER_OFFER: 'rider_offer_alarm',
  ensureBackgroundCustomerToken: jest.fn().mockResolvedValue('t'),
  ensureShopOrRiderSession: jest.fn().mockResolvedValue({ shop: null, rider: null }),
  cancelRiderOfferAlarm: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/overlayOfferCard', () => ({
  hideOverlayOfferCard: jest.fn(),
  openMainApp: jest.fn(),
}));

const { riderApi, shopApi } = require('../src/api');
const { ensureShopOrRiderSession } = require('../src/utils/orderAlarmNotifications');
const { openMainApp } = require('../src/utils/overlayOfferCard');
const AlarmScreen = require('../src/screens/rider/RiderAlarmScreen').default;

function textsOf(tree) {
  return tree.root.findAllByType('Text').map(n => n.children.join(''));
}

/** The pressable whose label is `label`, whatever wrapper renders it. */
function pressableLabelled(tree, label) {
  return tree.root.find(n => (
    typeof n.props.onPress === 'function'
    && n.findAllByType('Text').some(t => t.children.join('') === label)
  ));
}

const rendered = [];

async function render() {
  let tree;
  await act(async () => { tree = ReactTestRenderer.create(<AlarmScreen />); });
  await act(async () => {});
  rendered.push(tree);
  return tree;
}

describe('alarm activity root — role handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifee.getInitialNotification.mockResolvedValue(null);
    ensureShopOrRiderSession.mockResolvedValue({ shop: null, rider: null });
  });

  // The "nothing pending" branch schedules a 1.5s close — unmount so it does
  // not fire into a torn-down environment.
  afterEach(() => {
    while (rendered.length) rendered.pop().unmount();
  });

  it('shows the shop card with one Open app button for a new-order alarm', async () => {
    notifee.getInitialNotification.mockResolvedValue({
      notification: { data: { alertType: 'new_order_alarm' } },
    });
    shopApi.getMyOrders.mockResolvedValue({
      orders: [
        { id: 7, confirmed: true, rejected: false, orderNumber: 'O-7', total: 500 },
        { id: 9, confirmed: false, rejected: false, orderNumber: 'O-9', total: 240 },
      ],
    });

    const tree = await render();
    const texts = textsOf(tree);

    expect(riderApi.getActiveOffer).not.toHaveBeenCalled();
    expect(texts).toContain('New order');
    expect(texts).toContain('Order #O-9');
    expect(texts).toContain('Open app');
    // Confirming needs the in-app sheet — never a bare Accept here.
    expect(texts).not.toContain('Accept');
    // No server-side expiry on a shop order, so no countdown to show.
    expect(texts.some(t => /^\d+:\d\d$/.test(t))).toBe(false);

    await act(async () => { pressableLabelled(tree, 'Open app').props.onPress(); });
    expect(openMainApp).toHaveBeenCalled();
  });

  it('shows the rider card with Accept/Reject for an offer alarm', async () => {
    notifee.getInitialNotification.mockResolvedValue({
      notification: { data: { alertType: 'rider_offer_alarm' } },
    });
    riderApi.getActiveOffer.mockResolvedValue({
      offers: [{ id: 3, orderNumber: 'O-3', total: 120, expiresAt: new Date(Date.now() + 60000).toISOString() }],
    });

    const texts = textsOf(await render());

    expect(shopApi.getMyOrders).not.toHaveBeenCalled();
    expect(texts).toContain('Delivery offer');
    expect(texts).toContain('Accept');
    expect(texts).toContain('Reject');
  });

  // Notifee consumes the launch notification once, and some OEM launch paths
  // hand the activity a bare intent — the stored session has to carry it.
  it('falls back to the stored session when the launch notification is gone', async () => {
    notifee.getInitialNotification.mockResolvedValue(null);
    ensureShopOrRiderSession.mockResolvedValue({ shop: { id: 1 }, rider: null });
    shopApi.getMyOrders.mockResolvedValue({
      orders: [{ id: 9, confirmed: false, rejected: false, orderNumber: 'O-9', total: 240 }],
    });

    const texts = textsOf(await render());

    expect(texts).toContain('New order');
    expect(riderApi.getActiveOffer).not.toHaveBeenCalled();
  });

  it('says the order is already handled when nothing is pending', async () => {
    ensureShopOrRiderSession.mockResolvedValue({ shop: { id: 1 }, rider: null });
    shopApi.getMyOrders.mockResolvedValue({ orders: [{ id: 9, confirmed: true, rejected: false }] });

    expect(textsOf(await render())).toContain('Order already handled');
  });
});
