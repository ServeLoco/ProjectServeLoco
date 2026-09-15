/**
 * The "Reconnecting…" pill must not outlive the disconnection.
 *
 * useRealtimeConnectionState seeded its state during render and then
 * subscribed in an effect. Nothing replays lifecycle events, so a socket that
 * finished connecting in the gap between those two moments left the hook
 * stuck on `connected: false` for the whole session — the pill sat on Home
 * over a perfectly healthy socket. A local API (adb reverse to localhost)
 * connects in a few milliseconds and loses that race nearly every launch,
 * which is exactly where it was reported.
 */
jest.mock('../src/api/realtimeClient', () => ({
  getRealtimeConnectionState: jest.fn(),
  subscribeRealtimeLifecycle: jest.fn(),
}));

const React = require('react');
const TestRenderer = require('react-test-renderer');
const {
  getRealtimeConnectionState,
  subscribeRealtimeLifecycle,
} = require('../src/api/realtimeClient');
const { useRealtimeConnectionState } = require('../src/hooks/useRealtimeConnectionState');

let latest;
function Probe() {
  latest = useRealtimeConnectionState();
  return null;
}

describe('useRealtimeConnectionState', () => {
  let handler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = undefined;
    subscribeRealtimeLifecycle.mockImplementation((cb) => {
      handler = cb;
      return jest.fn();
    });
  });

  it('picks up a connect that landed before the subscription', async () => {
    // Disconnected at render; connected by the time the effect runs.
    getRealtimeConnectionState
      .mockReturnValueOnce({ connected: false, hasSocket: true })
      .mockReturnValue({ connected: true, hasSocket: true });

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(Probe));
    });

    expect(latest.connected).toBe(true);
  });

  it('still reports a genuinely disconnected socket', async () => {
    getRealtimeConnectionState.mockReturnValue({ connected: false, hasSocket: true });

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(Probe));
    });

    expect(latest.connected).toBe(false);
  });

  it('tracks later lifecycle events', async () => {
    getRealtimeConnectionState.mockReturnValue({ connected: false, hasSocket: true });
    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(Probe));
    });

    await TestRenderer.act(async () => { handler({ eventName: 'connected' }); });
    expect(latest.connected).toBe(true);

    await TestRenderer.act(async () => { handler({ eventName: 'disconnected' }); });
    expect(latest.connected).toBe(false);

    await TestRenderer.act(async () => { handler({ eventName: 'reconnected' }); });
    expect(latest.connected).toBe(true);
  });
});
