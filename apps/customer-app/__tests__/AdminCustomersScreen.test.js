/**
 * ADMIN TASK 12 — Customers screen: list + filters, detail drawer, trust/
 * block toggles with confirm (both directions, matching web severity).
 */
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminCustomersScreen from '../src/screens/admin/AdminCustomersScreen';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: {
    listCustomers: jest.fn(), getCustomer: jest.fn(),
    updateCustomerBlock: jest.fn(), updateCustomerTrust: jest.fn(),
  },
}));

const { adminApi } = require('../src/api');

const CUSTOMERS = {
  data: [
    { id: 1, name: 'Yash', phone: '9999999999', order_count: 5, trusted: true, blocked: false, created_at: '2026-01-01T00:00:00Z' },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const DETAIL = { id: 1, name: 'Yash', phone: '9999999999', trusted: true, blocked: false, order_count: 5, created_at: '2026-01-01T00:00:00Z' };

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

function mockAlertCaptureConfirm() {
  let confirmPromise = null;
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    confirmPromise = buttons.find((b) => b.text === 'Confirm')?.onPress?.();
  });
  return { spy, getConfirmPromise: () => confirmPromise };
}

describe('AdminCustomersScreen', () => {
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

  it('renders customers with trust/block badges', async () => {
    adminApi.listCustomers.mockResolvedValue(CUSTOMERS);

    await act(async () => {
      root = ReactTestRenderer.create(<AdminCustomersScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['Yash', 'Trusted']));
  });

  it('opens the detail drawer on row tap', async () => {
    adminApi.listCustomers.mockResolvedValue(CUSTOMERS);
    adminApi.getCustomer.mockResolvedValue({ data: DETAIL });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminCustomersScreen />);
    });

    const row = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Yash'))[0];
    await act(async () => { await row.props.onPress(); });

    expect(adminApi.getCustomer).toHaveBeenCalledWith(1);
    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Revoke trust', 'Block customer']));
  });

  it('confirms before blocking a customer', async () => {
    adminApi.listCustomers.mockResolvedValue(CUSTOMERS);
    adminApi.getCustomer.mockResolvedValue({ data: DETAIL });
    adminApi.updateCustomerBlock.mockResolvedValue({});
    const { spy: alertSpy, getConfirmPromise } = mockAlertCaptureConfirm();

    await act(async () => {
      root = ReactTestRenderer.create(<AdminCustomersScreen />);
    });
    const row = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Yash'))[0];
    await act(async () => { await row.props.onPress(); });

    const blockBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Block customer'))[0];
    await act(async () => {
      blockBtn.props.onPress();
      await getConfirmPromise();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(adminApi.updateCustomerBlock).toHaveBeenCalledWith(1, true);

    alertSpy.mockRestore();
  });

  it('confirms before revoking trust', async () => {
    adminApi.listCustomers.mockResolvedValue(CUSTOMERS);
    adminApi.getCustomer.mockResolvedValue({ data: DETAIL });
    adminApi.updateCustomerTrust.mockResolvedValue({});
    const { spy: alertSpy, getConfirmPromise } = mockAlertCaptureConfirm();

    await act(async () => {
      root = ReactTestRenderer.create(<AdminCustomersScreen />);
    });
    const row = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Yash'))[0];
    await act(async () => { await row.props.onPress(); });

    const trustBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Revoke trust'))[0];
    await act(async () => {
      trustBtn.props.onPress();
      await getConfirmPromise();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(adminApi.updateCustomerTrust).toHaveBeenCalledWith(1, false);

    alertSpy.mockRestore();
  });

  it('applies the trusted filter to the list request', async () => {
    adminApi.listCustomers.mockResolvedValue(CUSTOMERS);

    await act(async () => {
      root = ReactTestRenderer.create(<AdminCustomersScreen />);
    });

    adminApi.listCustomers.mockClear();
    const trustedChip = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Trusted'))
      .find((n) => n.props.style !== undefined && !n.props.activeOpacity === undefined || true);
    // The filter chip (not the badge) is the only "Trusted" node with onPress.
    await act(async () => { trustedChip.props.onPress(); });
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(adminApi.listCustomers).toHaveBeenCalledWith(expect.objectContaining({ trusted: '1' }));
  });
});
