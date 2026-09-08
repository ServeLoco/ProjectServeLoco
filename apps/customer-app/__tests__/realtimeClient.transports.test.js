// Regression: the socket.io client was briefly websocket-first
// (['websocket', 'polling']), the opposite tuning direction from the rest of
// this branch's weak-network hardening (HTTP timeout raised, health-check
// timeout raised, socket pingTimeout raised). A websocket upgrade can stall
// silently behind a captive portal, a proxy without Upgrade support, or
// carrier NAT weirdness — polling-first-then-upgrade (socket.io's own
// default order) connects everywhere first, then upgrades once confirmed.

const mockSocket = {
  on: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(),
  connected: false,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

jest.mock('../src/api/realtimeConfig', () => ({
  getRealtimeBaseUrl: jest.fn(() => 'http://localhost:3000'),
}));

jest.mock('../src/utils/apiCache', () => ({ invalidate: jest.fn() }));

const { io } = require('socket.io-client');
const { connectCustomerRealtime, disconnectCustomerRealtime } = require('../src/api/realtimeClient');

describe('connectCustomerRealtime transports order', () => {
  afterEach(() => {
    disconnectCustomerRealtime();
    jest.clearAllMocks();
  });

  it('connects polling-first-then-upgrade, not websocket-first', () => {
    connectCustomerRealtime('test-token');

    expect(io).toHaveBeenCalledTimes(1);
    const [, options] = io.mock.calls[0];
    expect(options.transports).toEqual(['polling', 'websocket']);
  });
});
