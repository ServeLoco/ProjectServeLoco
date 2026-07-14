/**
 * ADMIN TASK 9 — Admin Order Detail: rendering, status change confirm flow,
 * and 409-conflict handling on both status and payment mutations.
 */
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminOrderDetailScreen from '../src/screens/admin/AdminOrderDetailScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { orderId: 7 } }),
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: { getOrder: jest.fn(), updateOrderStatus: jest.fn(), updateOrderPayment: jest.fn() },
  ordersApi: { getOrder: jest.fn() },
  subscribeAdminOrderEvents: () => () => {},
  subscribeOrderEvents: () => () => {},
  subscribeRiderLocation: () => () => {},
  subscribeRealtime: () => () => {},
  subscribeRealtimeLifecycle: () => () => {},
}));

const { adminApi } = require('../src/api');

const ORDER = {
  id: 7, order_number: 'OD-7', total: 500, status: 'Pending', payment_status: 'Pending',
  customer_name: 'Yash', phone: '9999999999', address: '123 Street', created_at: '2026-07-12T10:00:00Z',
  subtotal: 450, delivery_charge: 50, items: [{ product_name: 'Milk', quantity: 2, line_total: 100 }],
};

// The confirm button's onPress (`() => applyStatusChange(...)`) returns the
// real promise from that async call — capture and await it directly instead
// of guessing how many microtask ticks the chain needs to settle.
function mockAlertCaptureConfirm() {
  let confirmPromise = null;
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    const confirmBtn = buttons.find((b) => b.text === 'Confirm');
    confirmPromise = confirmBtn?.onPress?.();
  });
  return { spy, getConfirmPromise: () => confirmPromise };
}

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('AdminOrderDetailScreen', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('renders order fields', async () => {
    adminApi.getOrder.mockResolvedValue({ data: ORDER });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminOrderDetailScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['Yash', '9999999999', '123 Street', '₹500.00']));
  });

  it('confirms then applies a forward status change', async () => {
    adminApi.getOrder.mockResolvedValue({ data: ORDER });
    adminApi.updateOrderStatus.mockResolvedValue({ order: { ...ORDER, status: 'Accepted' } });
    const { spy: alertSpy, getConfirmPromise } = mockAlertCaptureConfirm();

    await act(async () => {
      root = ReactTestRenderer.create(<AdminOrderDetailScreen />);
    });

    const acceptedChip = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Order Accepted'))[0];
    await act(async () => {
      acceptedChip.props.onPress();
      await getConfirmPromise();
    });

    expect(alertSpy).toHaveBeenCalled();
    // Two getOrder calls: initial load + refetch-before-patch race guard.
    // (RiderLiveMap is seeded via initialOrder, so it does no fetch of its own.)
    expect(adminApi.getOrder).toHaveBeenCalledTimes(2);
    expect(adminApi.updateOrderStatus).toHaveBeenCalledWith(7, 'Accepted', null);

    alertSpy.mockRestore();
  });

  it('surfaces a 409 conflict and refetches instead of silently applying', async () => {
    adminApi.getOrder.mockResolvedValue({ data: ORDER });
    const conflictErr = Object.assign(new Error('Order was updated by someone else.'), { status: 409 });
    adminApi.updateOrderStatus.mockRejectedValue(conflictErr);
    const { spy: alertSpy, getConfirmPromise } = mockAlertCaptureConfirm();

    await act(async () => {
      root = ReactTestRenderer.create(<AdminOrderDetailScreen />);
    });

    const acceptedChip = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Order Accepted'))[0];
    await act(async () => {
      acceptedChip.props.onPress();
      await getConfirmPromise();
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['Order was updated by someone else.']));
    // Refetch-on-409: initial load + pre-patch race check + post-409 refetch.
    // (RiderLiveMap is seeded via initialOrder, so it does no fetch of its own.)
    expect(adminApi.getOrder).toHaveBeenCalledTimes(3);

    alertSpy.mockRestore();
  });
});
