/**
 * Tests for the useNetworkStatus health-ping URL construction.
 *
 * The bug this guards against: API base URL ends in '/api' (e.g.
 * https://api.serveloco.app/api) but the /health endpoint is mounted at
 * the root, NOT under /api. If the hook blindly appends '/health', it
 * pings /api/health (404), the consecutive-failure threshold trips, and
 * the offline banner falsely shows up while the user is online.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { act } from 'react-test-renderer';

jest.mock('../src/api/config', () => ({
  getApiBaseUrl: jest.fn(),
}));

jest.mock('react-native', () => {
  const AppState = {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  return { AppState };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

const { getApiBaseUrl } = require('../src/api/config');

function renderUseNetworkStatus(options) {
  const captured = { current: null };
  function Probe() {
    const { useNetworkStatus } = require('../src/hooks/useNetworkStatus');
    captured.current = useNetworkStatus(options);
    return null;
  }
  let testRenderer;
  act(() => {
    testRenderer = ReactTestRenderer.create(<Probe />);
  });
  return { captured, testRenderer };
}

describe('useNetworkStatus', () => {
  let originalFetch;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('pings the ROOT /ping endpoint, NOT /api/ping', async () => {
    getApiBaseUrl.mockReturnValue('https://api.serveloco.app/api');
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    renderUseNetworkStatus();

    // The first check fires synchronously; let microtasks flush.
    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.serveloco.app/ping',
      expect.objectContaining({ method: 'HEAD' })
    );
    // It must NOT have been called with /api/ping.
    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://api.serveloco.app/api/ping',
      expect.any(Object)
    );
  });

  it('handles a base URL without a trailing /api suffix', async () => {
    getApiBaseUrl.mockReturnValue('http://10.0.2.2:3000');
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    renderUseNetworkStatus();

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://10.0.2.2:3000/ping',
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  it('flips isOnline=false after the configured failure threshold', async () => {
    getApiBaseUrl.mockReturnValue('https://api.serveloco.app/api');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const { captured } = renderUseNetworkStatus({ checkIntervalMs: 60000 });

    // First failure — should NOT flip yet (threshold = 2).
    await act(async () => { await Promise.resolve(); });
    expect(captured.current.isOnline).toBe(true);

    // Second failure — flips offline.
    await act(async () => {
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.current.isOnline).toBe(false);
  });

  it('recovers when the next ping succeeds', async () => {
    getApiBaseUrl.mockReturnValue('https://api.serveloco.app/api');
    let response = { ok: false, status: 500 };
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve(response));

    const { captured } = renderUseNetworkStatus({ checkIntervalMs: 60000 });

    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.current.isOnline).toBe(false);

    // Now the server comes back.
    response = { ok: true, status: 200 };
    await act(async () => {
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(captured.current.isOnline).toBe(true);
  });
});