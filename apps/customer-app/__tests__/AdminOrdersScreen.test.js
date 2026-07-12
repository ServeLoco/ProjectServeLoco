/**
 * ADMIN TASK 9 — Admin Orders list: rendering, quick-filter chips, row tap
 * navigates to detail, pagination.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminOrdersScreen from '../src/screens/admin/AdminOrdersScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: { listOrders: jest.fn() },
  subscribeAdminOrderEvents: () => () => {},
  subscribeAdminRealtimeLifecycle: () => () => {},
}));

const { adminApi } = require('../src/api');

const ORDERS_RESPONSE = {
  data: [
    { id: 1, order_number: 'OD-1', customer_name: 'Yash', phone: '9999999999', total: 172, status: 'Pending', payment_status: 'Pending', created_at: '2026-07-12T10:00:00Z' },
    { id: 2, order_number: 'OD-2', customer_name: 'Reza', phone: '8888888888', total: 340, status: 'Delivered', payment_status: 'Paid', created_at: '2026-07-11T10:00:00Z' },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('AdminOrdersScreen', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Each screen schedules a 300ms debounce timer on mount — leaving it
    // mounted lets that timer fire during a later test's real-time wait and
    // pollute its call count, so always unmount before moving on.
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('renders the order list from the API response', async () => {
    adminApi.listOrders.mockResolvedValue(ORDERS_RESPONSE);

    await act(async () => {
      root = ReactTestRenderer.create(<AdminOrdersScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['#OD-1', '#OD-2', '₹172', '₹340']));
  });

  it('navigates to AdminOrderDetail when a row is tapped', async () => {
    adminApi.listOrders.mockResolvedValue(ORDERS_RESPONSE);

    await act(async () => {
      root = ReactTestRenderer.create(<AdminOrdersScreen />);
    });

    const row = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('#OD-1'))[0];
    await act(async () => {
      row.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('AdminOrderDetail', { orderId: 1 });
  });

  it('quick-filter chip refetches with the status param', async () => {
    adminApi.listOrders.mockResolvedValue(ORDERS_RESPONSE);

    await act(async () => {
      root = ReactTestRenderer.create(<AdminOrdersScreen />);
    });

    adminApi.listOrders.mockClear();
    const chip = root.root.findByProps({ testID: 'quick-filter-Delivered' });
    // Flush the press (state update + effect cleanup cancelling the stale
    // mount-time debounce timer) in its own act() before waiting for the
    // freshly-scheduled one — otherwise the two can race in real time.
    await act(async () => {
      chip.props.onPress();
    });
    // Filter changes are debounced 300ms (matches web) before refetching.
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(adminApi.listOrders).toHaveBeenCalledWith(expect.objectContaining({ status: 'Delivered' }));
  });
});
