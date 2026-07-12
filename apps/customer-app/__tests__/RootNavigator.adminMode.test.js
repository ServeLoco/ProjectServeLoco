/**
 * ADMIN TASK 7 — RootNavigator routes an active mobile admin (admin +
 * adminToken both set) into AdminNavigator instead of CustomerNavigator,
 * even before shop/rider checks.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import RootNavigator from '../src/navigation/RootNavigator';
import { useAuthStore } from '../src/stores';

jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReachable: true, lastCheckedAt: null }),
}));
jest.mock('../src/api/analyticsClient', () => ({
  trackScreen: () => {},
  initAnalytics: () => {},
  stopAnalytics: () => {},
}));
// AdminMintGate retries the mint on mount — keep it a pending promise so the
// gate stays in its "Opening Admin Mode…" state for the assertion below.
jest.mock('../src/api/adminApi', () => ({
  adminApi: { mintSession: jest.fn(() => new Promise(() => {})) },
}));

const INITIAL_STATE = useAuthStore.getState();
let root;

describe('RootNavigator — admin routing', () => {
  afterEach(() => {
    if (root) {
      ReactTestRenderer.act(() => { root.unmount(); });
      root = null;
    }
    useAuthStore.setState(INITIAL_STATE, true);
  });

  it('renders AdminNavigator (Dashboard placeholder) when admin + adminToken are set', async () => {
    await ReactTestRenderer.act(async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        admin: { id: 4, active: true },
        adminToken: 'admin-jwt',
        shop: null,
        rider: null,
      });
      root = ReactTestRenderer.create(<RootNavigator />);
    });

    const text = root.root.findAll((node) => node.type === 'Text' && typeof node.props.children === 'string')
      .map((n) => n.props.children).join(' | ');
    // AdminDashboardScreen loads asynchronously (spinner first) — assert on
    // the tab bar instead, which renders synchronously and is Admin-only.
    expect(text).toContain('People');
  });

  it('holds the mint gate (not customer home) while adminToken is minting', async () => {
    await ReactTestRenderer.act(async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        admin: { id: 4, active: true },
        adminToken: null,
        shop: null,
        rider: null,
      });
      root = ReactTestRenderer.create(<RootNavigator />);
    });

    const text = root.root.findAll((node) => node.type === 'Text' && typeof node.props.children === 'string')
      .map((n) => n.props.children).join(' | ');
    // Neither the admin shell nor the customer home — the gate holds.
    expect(text).not.toContain('People');
    expect(text).toContain('Opening Admin Mode…');
  });
});
