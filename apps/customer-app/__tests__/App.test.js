/**
 * @format
 */

import React from 'react';
import App from '../App';
import ReactTestRenderer from 'react-test-renderer';

// Mock hooks/components that schedule background timers or fetch on mount,
// so the Jest worker can exit cleanly after a single render. Without these
// stubs, useNetworkStatus creates a 30s setInterval, AppState listeners
// fire after teardown, and the worker force-exits with "Jest environment
// has been torn down" warnings.
jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReachable: true, lastCheckedAt: null }),
}));
jest.mock('../src/hooks/useCustomerRealtime', () => ({
  useCustomerRealtime: () => {},
}));
jest.mock('../src/hooks/useLocalNotifications', () => ({
  useLocalNotifications: () => {},
}));

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  // Drain any pending timers created by app-level effects so the Jest
  // worker can exit cleanly.
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });
});
