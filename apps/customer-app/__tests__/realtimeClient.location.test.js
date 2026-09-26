// The socket carries the delivery pin: in its auth on every connect AND
// reconnect, and as 'location:update' when the pin moves. The server resolves
// it to an area/zone and picks the broadcast room from it — a returning
// customer used to sit in no room at all, because the app only announced its
// area when it CHANGED.

const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
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
const {
  connectCustomerRealtime,
  disconnectCustomerRealtime,
  setRealtimeLocation,
} = require('../src/api/realtimeClient');

// socket.io calls the auth callback before each connection attempt.
const readAuth = () => {
  const [, options] = io.mock.calls[io.mock.calls.length - 1];
  let payload;
  options.auth((value) => { payload = value; });
  return payload;
};

describe('realtime location', () => {
  afterEach(() => {
    disconnectCustomerRealtime();
    mockSocket.connected = false;
    jest.clearAllMocks();
  });

  it('every connection attempt carries the CURRENT pin, so a reconnect is never pin-less', () => {
    setRealtimeLocation({ lat: 29.44, lng: 75.67 });
    connectCustomerRealtime('token-1');

    expect(readAuth()).toEqual(expect.objectContaining({ token: 'token-1', latitude: 29.44, longitude: 75.67 }));

    // The pin moves while the socket is down; the reconnect's auth has it.
    setRealtimeLocation({ lat: 12.97, lng: 77.6 });
    expect(readAuth()).toEqual(expect.objectContaining({ latitude: 12.97, longitude: 77.6 }));
  });

  it('sends location:update when the pin moves on a connected socket, once per pin', () => {
    connectCustomerRealtime('token-1');
    mockSocket.connected = true;

    setRealtimeLocation({ lat: 29.5, lng: 75.5 });
    setRealtimeLocation({ lat: 29.5, lng: 75.5 });
    setRealtimeLocation({ lat: 29.6, lng: 75.5 });

    expect(mockSocket.emit.mock.calls).toEqual([
      ['location:update', { latitude: 29.5, longitude: 75.5 }],
      ['location:update', { latitude: 29.6, longitude: 75.5 }],
    ]);
  });

  it('ignores a missing or broken pin instead of sending (0, 0)', () => {
    connectCustomerRealtime('token-1');
    mockSocket.connected = true;

    setRealtimeLocation(null);
    setRealtimeLocation({ lat: null, lng: null });
    setRealtimeLocation({ lat: 'abc', lng: 75 });

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});
