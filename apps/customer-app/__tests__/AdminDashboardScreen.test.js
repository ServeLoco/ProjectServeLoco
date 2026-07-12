/**
 * ADMIN TASK 8 — Admin Dashboard screen: KPI rendering, delivery toggle
 * confirm-on-off, and shop status read-only rendering.
 */
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminDashboardScreen from '../src/screens/admin/AdminDashboardScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: {
    getDashboard: jest.fn(),
    updateSettings: jest.fn(),
  },
  subscribeAdminOrderEvents: () => () => {},
  subscribeAdminRealtimeLifecycle: () => () => {},
}));

const { adminApi } = require('../src/api');

const DASHBOARD_RESPONSE = {
  data: {
    sales: { todaySales: 688, todayOrders: 12, pendingOrders: 3, pendingPaymentTotal: 1818 },
    shop_open: true,
    delivery_available: true,
    latest_orders: [
      { id: 1, order_number: 'OD-1', customer_name: 'Yash', total: 172, status: 'Pending', created_at: '2026-07-12T10:00:00Z' },
    ],
  },
};

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('AdminDashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders KPI values and shop/delivery status from the dashboard payload', async () => {
    adminApi.getDashboard.mockResolvedValue(DASHBOARD_RESPONSE);

    let root;
    await act(async () => {
      root = ReactTestRenderer.create(<AdminDashboardScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['₹688', '12', '3', '₹1818', 'Available', 'Open']));
  });

  it('confirms before turning delivery off, and applies it on confirm', async () => {
    adminApi.getDashboard.mockResolvedValue(DASHBOARD_RESPONSE);
    adminApi.updateSettings.mockResolvedValue({});
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      const confirmBtn = buttons.find((b) => b.text === 'Turn off');
      confirmBtn?.onPress?.();
    });

    let root;
    await act(async () => {
      root = ReactTestRenderer.create(<AdminDashboardScreen />);
    });

    const toggle = root.root.findAll((n) => n.props?.onPress && n.props?.children !== undefined)
      .find((n) => findAllText(n).includes('Available'));
    await act(async () => {
      toggle.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('Turn delivery off?', expect.any(String), expect.any(Array));
    expect(adminApi.updateSettings).toHaveBeenCalledWith({ delivery_available: false });

    alertSpy.mockRestore();
  });

  it('shows a retry state when the dashboard fails to load', async () => {
    adminApi.getDashboard.mockRejectedValue(new Error('network'));

    let root;
    await act(async () => {
      root = ReactTestRenderer.create(<AdminDashboardScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['Could not load dashboard', 'Retry']));
  });
});
