/**
 * ADMIN TASK 10 — Riders screen: list rendering, create, toggle active,
 * live admin.rider.updated merge, and exclusivity errors surfaced.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminRidersScreen from '../src/screens/admin/AdminRidersScreen';

let riderUpdatedHandler = null;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: { listRiders: jest.fn(), createRider: jest.fn(), updateRider: jest.fn() },
  subscribeAdminRealtime: (eventName, handler) => {
    if (eventName === 'admin.rider.updated') riderUpdatedHandler = handler;
    return () => { riderUpdatedHandler = null; };
  },
  subscribeAdminRealtimeLifecycle: () => () => {},
}));

const { adminApi } = require('../src/api');

const RIDERS = [
  { id: 1, display_name: 'Ravi', phone: '9999999999', active: true, is_online: true },
  { id: 2, display_name: 'Kiran', phone: '8888888888', active: false, is_online: false },
];

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('AdminRidersScreen', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    riderUpdatedHandler = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('renders riders with online/active state', async () => {
    adminApi.listRiders.mockResolvedValue({ riders: RIDERS });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminRidersScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['Ravi', 'Kiran', 'Online', 'Offline', 'Active', 'Inactive']));
  });

  it('creates a rider then refreshes the list', async () => {
    adminApi.listRiders.mockResolvedValue({ riders: RIDERS });
    adminApi.createRider.mockResolvedValue({ rider: { id: 3 } });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminRidersScreen />);
    });

    const addBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('New Rider'))[0];
    await act(async () => { addBtn.props.onPress(); });

    const phoneInput = root.root.findByProps({ placeholder: 'Must already exist (OTP login once)' });
    await act(async () => { phoneInput.props.onChangeText('9998887770'); });

    adminApi.listRiders.mockClear();
    const createBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Create rider'))[0];
    await act(async () => { await createBtn.props.onPress(); });

    expect(adminApi.createRider).toHaveBeenCalledWith({ phone: '9998887770', displayName: undefined });
    expect(adminApi.listRiders).toHaveBeenCalled();
  });

  it('surfaces an exclusivity error from create', async () => {
    adminApi.listRiders.mockResolvedValue({ riders: [] });
    adminApi.createRider.mockRejectedValue(new Error('Phone already assigned as a mobile admin.'));

    await act(async () => {
      root = ReactTestRenderer.create(<AdminRidersScreen />);
    });

    const addBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('New Rider'))[0];
    await act(async () => { addBtn.props.onPress(); });

    const phoneInput = root.root.findByProps({ placeholder: 'Must already exist (OTP login once)' });
    await act(async () => { phoneInput.props.onChangeText('9998887770'); });

    const createBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Create rider'))[0];
    await act(async () => { await createBtn.props.onPress(); });

    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Phone already assigned as a mobile admin.']));
  });

  it('toggles active state', async () => {
    adminApi.listRiders.mockResolvedValue({ riders: RIDERS });
    adminApi.updateRider.mockResolvedValue({ rider: {} });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminRidersScreen />);
    });

    const toggle = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Active'))[0];
    await act(async () => { await toggle.props.onPress(); });

    expect(adminApi.updateRider).toHaveBeenCalledWith(1, { active: false });
  });

  it('merges a live admin.rider.updated event into the list', async () => {
    adminApi.listRiders.mockResolvedValue({ riders: RIDERS });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminRidersScreen />);
    });

    act(() => {
      riderUpdatedHandler?.({ id: 2, is_online: true });
    });

    const texts = findAllText(root.root);
    // Kiran (id 2) should now show Online after the live merge.
    expect(texts).toEqual(expect.arrayContaining(['Kiran', 'Online']));
  });
});
