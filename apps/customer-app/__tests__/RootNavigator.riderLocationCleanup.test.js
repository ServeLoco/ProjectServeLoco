/**
 * RootNavigator clears a leftover rider location registration on any launch
 * outside rider mode.
 *
 * The registration is held by Android and survives sign-out, losing the rider
 * role and the app being killed. Only the rider dashboard ever stopped it, so a
 * phone no longer in rider mode kept it forever, and every update Android
 * delivered to the closed app crashed it in expo-task-manager (Play Console's
 * top crash, 2026-10-01).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

// The effect is Android-only (rider mode never runs on iOS); jest-expo
// defaults to 'ios', so set it before RootNavigator loads.
Platform.OS = 'android';
const RootNavigator = require('../src/navigation/RootNavigator').default;
const { useAuthStore } = require('../src/stores');

jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReachable: true, lastCheckedAt: null }),
}));
jest.mock('../src/api/analyticsClient', () => ({
  trackScreen: () => {},
  initAnalytics: () => {},
  stopAnalytics: () => {},
}));
// The role shells are not under test — only which one is chosen matters.
jest.mock('../src/navigation/CustomerNavigator', () => () => null);
jest.mock('../src/navigation/ShopOwnerNavigator', () => () => null);
jest.mock('../src/navigation/RiderNavigator', () => () => null);
jest.mock('../src/navigation/AdminNavigator', () => () => null);

const INITIAL_STATE = useAuthStore.getState();
let root;

async function renderWith(authState) {
  await ReactTestRenderer.act(async () => {
    useAuthStore.setState({
      isAuthenticated: false, admin: null, adminToken: null, shop: null, rider: null,
      hasHydrated: true,
      ...authState,
    });
    root = ReactTestRenderer.create(<RootNavigator />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('RootNavigator — leftover rider location registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    Location.stopLocationUpdatesAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (root) {
      ReactTestRenderer.act(() => { root.unmount(); });
      root = null;
    }
    useAuthStore.setState(INITIAL_STATE, true);
  });

  it('stops it for a signed-out user', async () => {
    await renderWith({});

    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith('rider-background-location');
  });

  it('stops it for a customer who used to be a rider', async () => {
    await renderWith({ isAuthenticated: true, rider: null });

    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith('rider-background-location');
  });

  it('stops it for a shop owner, whose shell wins over a rider record', async () => {
    await renderWith({ isAuthenticated: true, shop: { id: 3 }, rider: { id: 1 } });

    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith('rider-background-location');
  });

  it('leaves it alone in rider mode — the rider dashboard owns it there', async () => {
    await renderWith({ isAuthenticated: true, rider: { id: 1 } });

    expect(Location.hasStartedLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('waits for the stored session to load, so a rider is never mistaken for signed out', async () => {
    await renderWith({ hasHydrated: false });

    expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('does nothing when there is no registration', async () => {
    Location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);

    await renderWith({});

    expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});
