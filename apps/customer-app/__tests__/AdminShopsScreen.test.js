/**
 * ADMIN TASK 11 — Shops screen: list rendering, create, confirm-before-close/
 * deactivate toggles, edit drawer.
 */
import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminShopsScreen from '../src/screens/admin/AdminShopsScreen';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: { listShops: jest.fn(), createShop: jest.fn(), updateShop: jest.fn() },
  subscribeAdminRealtimeLifecycle: () => () => {},
}));

const { adminApi } = require('../src/api');

const SHOPS = [
  { id: 1, name: 'Burger Point', owner_user_id: 7, owner_name: 'Reza', owner_phone: '9999999999', product_count: 12, active: true, is_open: true },
  { id: 2, name: 'Milk Corner', owner_user_id: null, product_count: 0, active: true, is_open: false },
];

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('AdminShopsScreen', () => {
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

  it('renders shops with owner/product/active/open state', async () => {
    adminApi.listShops.mockResolvedValue({ shops: SHOPS });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminShopsScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining([
      'Burger Point', 'Reza (9999999999)', '12 products',
      'Milk Corner', '— unassigned —', 'Open', 'Closed',
    ]));
  });

  it('closing a shop asks for confirmation before applying', async () => {
    adminApi.listShops.mockResolvedValue({ shops: SHOPS });
    adminApi.updateShop.mockResolvedValue({ shop: {} });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      buttons.find((b) => b.text === 'Close')?.onPress?.();
    });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminShopsScreen />);
    });

    const openToggle = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Open'))[0];
    await act(async () => {
      openToggle.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(adminApi.updateShop).toHaveBeenCalledWith(1, { is_open: false });

    alertSpy.mockRestore();
  });

  it('opening a shop does not require confirmation', async () => {
    adminApi.listShops.mockResolvedValue({ shops: SHOPS });
    adminApi.updateShop.mockResolvedValue({ shop: {} });
    const alertSpy = jest.spyOn(Alert, 'alert');

    await act(async () => {
      root = ReactTestRenderer.create(<AdminShopsScreen />);
    });

    const closedToggle = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Closed'))[0];
    await act(async () => {
      await closedToggle.props.onPress();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(adminApi.updateShop).toHaveBeenCalledWith(2, { is_open: true });

    alertSpy.mockRestore();
  });

  it('creates a shop with an owner phone', async () => {
    adminApi.listShops.mockResolvedValue({ shops: [] });
    adminApi.createShop.mockResolvedValue({ shop: { id: 3 } });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminShopsScreen />);
    });

    const addBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('New Shop'))[0];
    await act(async () => { addBtn.props.onPress(); });

    const nameInput = root.root.findByProps({ placeholder: undefined, value: '' });
    await act(async () => { nameInput.props.onChangeText('Fresh Mart'); });
    const phoneInput = root.root.findByProps({ placeholder: '+919876543210' });
    await act(async () => { phoneInput.props.onChangeText('9998887770'); });

    const saveBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Create shop'))[0];
    await act(async () => { await saveBtn.props.onPress(); });

    expect(adminApi.createShop).toHaveBeenCalledWith({ name: 'Fresh Mart', owner_phone: '9998887770' });
  });
});
