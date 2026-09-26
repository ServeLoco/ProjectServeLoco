/**
 * The customer socket's pin decides its broadcast room — resolved on the
 * server, from the handshake of every (re)connect and from 'location:update'.
 * A returning customer used to sit in NO room: the app only announced its
 * area when it changed, so every price/shop/delivery push missed them.
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) },
}));

jest.mock('../src/utils/areaScope', () => ({
  resolveAreaForPoint: jest.fn(),
  listAreas: jest.fn().mockResolvedValue([]),
  getAreaById: jest.fn(),
}));

const { pool } = require('../src/db/mysql');
const { resolveAreaForPoint } = require('../src/utils/areaScope');
const { applyCustomerLocation, handleLocationUpdate } = require('../src/realtime/socket');
const customerLocation = require('../src/realtime/customerLocation');

const BENGALURU = { latitude: 12.9716, longitude: 77.6046 };
const HISAR = { latitude: 29.5152, longitude: 75.4548 };
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };

const byPin = (pin) => {
  if (pin.lat === BENGALURU.latitude) return { areaId: 2, zoneId: 5 };
  if (pin.lat === HISAR.latitude) return { areaId: 1, zoneId: 3 };
  return null;
};

const makeSocket = (auth = { role: 'customer', id: 42 }) => ({
  id: `sock-${Math.random()}`,
  data: { auth },
  disconnected: false,
  join: jest.fn(),
  leave: jest.fn(),
});

const userUpdates = () => pool.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE users SET current_area_id'));

beforeEach(() => {
  jest.clearAllMocks();
  customerLocation._resetForTests();
  resolveAreaForPoint.mockImplementation(async (lat, lng) => byPin({ lat, lng }));
});

describe('applyCustomerLocation', () => {
  it('joins the room of the area the pin is in, and records area + zone on the user', async () => {
    const socket = makeSocket();
    const located = await applyCustomerLocation(socket, { lat: BENGALURU.latitude, lng: BENGALURU.longitude });

    expect(located).toEqual({ areaId: 2, zoneId: 5, loc: { lat: 12.972, lng: 77.605 } });
    expect(socket.join).toHaveBeenCalledWith('customers:2');
    expect(socket.data).toMatchObject({ areaId: 2, zoneId: 5, openLoc: { lat: 12.972, lng: 77.605 } });
    expect(userUpdates()).toEqual([[expect.any(String), [2, 5, 42]]]);
  });

  it('moves rooms when the pin crosses into another area', async () => {
    const socket = makeSocket();
    await applyCustomerLocation(socket, { lat: BENGALURU.latitude, lng: BENGALURU.longitude });
    await applyCustomerLocation(socket, { lat: HISAR.latitude, lng: HISAR.longitude });

    expect(socket.leave).toHaveBeenCalledWith('customers:2');
    expect(socket.join).toHaveBeenLastCalledWith('customers:1');
    expect(socket.data.areaId).toBe(1);
    // The app-open location stays the first one.
    expect(socket.data.openLoc).toEqual({ lat: 12.972, lng: 77.605 });
  });

  it('outside every zone: leaves the area room and joins none — never a default area', async () => {
    const socket = makeSocket();
    await applyCustomerLocation(socket, { lat: BENGALURU.latitude, lng: BENGALURU.longitude });
    await applyCustomerLocation(socket, { lat: MUMBAI.latitude, lng: MUMBAI.longitude });

    expect(socket.leave).toHaveBeenCalledWith('customers:2');
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.data.areaId).toBeNull();
    expect(userUpdates()[1][1]).toEqual([null, null, 42]);
  });

  it('a slow answer overtaken by a newer pin is dropped', async () => {
    const socket = makeSocket();
    let releaseSlow;
    resolveAreaForPoint
      .mockImplementationOnce(() => new Promise((r) => { releaseSlow = () => r({ areaId: 1, zoneId: 3 }); }))
      .mockImplementationOnce(async () => ({ areaId: 2, zoneId: 5 }));

    const slow = applyCustomerLocation(socket, { lat: HISAR.latitude, lng: HISAR.longitude });
    await applyCustomerLocation(socket, { lat: BENGALURU.latitude, lng: BENGALURU.longitude });
    releaseSlow();
    await slow;

    expect(socket.data.areaId).toBe(2);
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith('customers:2');
  });

  it('ignores admin sockets', async () => {
    const socket = makeSocket({ role: 'admin', adminRole: 'area_admin', areaId: 1 });
    expect(await applyCustomerLocation(socket, { lat: 1, lng: 1 })).toBeNull();
    expect(resolveAreaForPoint).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });
});

describe('handleLocationUpdate', () => {
  it('rejects a missing or broken pin without resolving anything — (0, 0) is not a pin', async () => {
    const socket = makeSocket();
    await handleLocationUpdate(socket, {});
    await handleLocationUpdate(socket, { latitude: null, longitude: null });
    await handleLocationUpdate(socket, { latitude: 'x', longitude: 'y' });
    await handleLocationUpdate(socket, { latitude: 95, longitude: 10 });
    expect(resolveAreaForPoint).not.toHaveBeenCalled();
  });

  it('rate-limits a client spamming updates', async () => {
    const socket = makeSocket();
    for (let i = 0; i < 15; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await handleLocationUpdate(socket, BENGALURU);
    }
    expect(resolveAreaForPoint).toHaveBeenCalledTimes(10);
  });
});

describe('saveCustomerLocation', () => {
  it('writes once per real change, not once per reconnect', async () => {
    await customerLocation.saveCustomerLocation(42, 2, 5);
    await customerLocation.saveCustomerLocation(42, 2, 5);
    await customerLocation.saveCustomerLocation(42, 2, 5);
    await customerLocation.saveCustomerLocation(42, 2, 6);
    expect(userUpdates().map(([, params]) => params)).toEqual([[2, 5, 42], [2, 6, 42]]);
  });
});
