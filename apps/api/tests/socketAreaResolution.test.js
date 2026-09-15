/**
 * Area attribution at the socket layer.
 *
 * There used to be a resolveAreaIdForSocketUser here: a users.last_area_id ->
 * default-area chain that stamped every customer socket at connect, because
 * no pin exists at the socket layer (H7 - a cold-start connect races the
 * app's own area resolution). It was a guess, and it was wrong in both
 * directions: it put a customer standing in area 2 into area 1's broadcast
 * room because that is where they last ordered, and it filed their analytics
 * session under area 1 too, inflating that team's live-user panel with
 * another team's customers - names and phone numbers included.
 *
 * It is gone. A customer socket now joins no area room at connect, and the
 * app emits 'area:changed' the moment its live pin resolves (the FIRST
 * resolve included), which is when the room join and the analytics
 * attribution both happen - with a real area or not at all.
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/utils/areaScope', () => ({
  getDefaultArea: jest.fn(),
  listAreas: jest.fn(),
  getAreaById: jest.fn(),
}));

const { pool } = require('../src/db/mysql');
const { bustUserState } = require('../src/utils/userState');
const { getDefaultArea, listAreas, getAreaById } = require('../src/utils/areaScope');
const socketModule = require('../src/realtime/socket');
const { joinAreaRoom, rejoinAreaRoom } = socketModule;

const fakeSocket = (auth) => ({ data: { auth }, join: jest.fn() });

describe('customer socket area attribution at connect', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    bustUserState();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('no longer exposes a last_area_id/default-area resolver', () => {
    expect(socketModule.resolveAreaIdForSocketUser).toBeUndefined();
  });

  it('joins no customers room and reads no area, however the user last ordered', async () => {
    process.env.NODE_ENV = 'production';
    const socket = fakeSocket({ id: 42, role: 'customer' });

    await joinAreaRoom(socket);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.data.areaId).toBeUndefined();
    // The guess cost a DB read per connect, too.
    expect(pool.query).not.toHaveBeenCalled();
    expect(getDefaultArea).not.toHaveBeenCalled();
  });
});

/**
 * TASK 23 — joinAreaRoom (src/realtime/socket.js). Its customer and
 * super_admin branches call resolveAreaIdForSocketUser/listAreas — both real
 * DB reads — guarded to skip under NODE_ENV=test at the same call sites
 * (realtime.test.js exercises real socket.io connections with no db/mysql
 * mock), so exercising those branches here requires temporarily forcing
 * NODE_ENV away from 'test'. The area_admin branch has no DB dependency and
 * is covered directly by realtime.test.js's real socket connections instead.
 */
describe('joinAreaRoom', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    // users.last_area_id is read through a 30s per-user cache
    // (utils/userState.js) — clear it so one case's row can't answer the next.
    bustUserState();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('joins admin:<areaId> directly for an area_admin using the JWT claim, no DB call', async () => {
    const socket = fakeSocket({ role: 'admin', adminRole: 'area_admin', areaId: 5 });

    await joinAreaRoom(socket);

    expect(socket.join).toHaveBeenCalledWith('admin:5');
    expect(pool.query).not.toHaveBeenCalled();
    expect(listAreas).not.toHaveBeenCalled();
  });

  it('joins every admin:<areaId> room for a super_admin', async () => {
    process.env.NODE_ENV = 'production';
    listAreas.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const socket = fakeSocket({ role: 'admin', adminRole: 'super_admin' });

    await joinAreaRoom(socket);

    expect(socket.join).toHaveBeenCalledWith('admin:1');
    expect(socket.join).toHaveBeenCalledWith('admin:2');
    expect(socket.join).toHaveBeenCalledWith('admin:3');
    expect(socket.data.allAdminAreas).toBe(true);
  });

  // Platform-level events (admin_notifications.area_id IS NULL — a signup,
  // which happens before any pin exists) belong to no area, so no
  // admin:<areaId> room can carry them. Only super admins join this one,
  // which is what keeps them out of an area team's inbox.
  it('joins the platform room for a super_admin, and never for an area_admin', async () => {
    process.env.NODE_ENV = 'production';
    listAreas.mockResolvedValueOnce([{ id: 1 }]);
    const superAdmin = fakeSocket({ role: 'admin', adminRole: 'super_admin' });
    await joinAreaRoom(superAdmin);
    expect(superAdmin.join).toHaveBeenCalledWith(socketModule.PLATFORM_ADMIN_ROOM);

    const areaAdmin = fakeSocket({ role: 'admin', adminRole: 'area_admin', areaId: 5 });
    await joinAreaRoom(areaAdmin);
    expect(areaAdmin.join).not.toHaveBeenCalledWith(socketModule.PLATFORM_ADMIN_ROOM);
  });

  it('is a no-op when the socket has no auth', async () => {
    const socket = fakeSocket(undefined);
    await expect(joinAreaRoom(socket)).resolves.toBeUndefined();
    expect(socket.join).not.toHaveBeenCalled();
  });
});

/**
 * Bug fix (multi-area audit finding #13) — rejoinAreaRoom used to trust the
 * client-supplied areaId outright, letting any connected customer join
 * ANY area's `customers:<areaId>` room by just emitting a spoofed id,
 * regardless of where they actually are. Now validates it against a real,
 * active area first.
 */
describe('rejoinAreaRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // users.last_area_id is read through a 30s per-user cache
    // (utils/userState.js) — clear it so one case's row can't answer the next.
    bustUserState();
  });

  const fakeSocketWithLeave = (auth, currentAreaId) => ({
    data: { auth, areaId: currentAreaId },
    join: jest.fn(),
    leave: jest.fn(),
  });

  it('joins the new room when the areaId is real and active', async () => {
    getAreaById.mockResolvedValueOnce({ id: 2, active: 1 });
    const socket = fakeSocketWithLeave({ role: 'customer', id: 42 }, 1);

    await rejoinAreaRoom(socket, 2);

    expect(socket.leave).toHaveBeenCalledWith('customers:1');
    expect(socket.join).toHaveBeenCalledWith('customers:2');
    expect(socket.data.areaId).toBe(2);
  });

  it('rejects a spoofed/nonexistent areaId — no join, no leave', async () => {
    getAreaById.mockResolvedValueOnce(null);
    const socket = fakeSocketWithLeave({ role: 'customer', id: 42 }, 1);

    await rejoinAreaRoom(socket, 999);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.leave).not.toHaveBeenCalled();
    expect(socket.data.areaId).toBe(1);
  });

  it('rejects a real but deactivated area', async () => {
    getAreaById.mockResolvedValueOnce({ id: 2, active: 0 });
    const socket = fakeSocketWithLeave({ role: 'customer', id: 42 }, 1);

    await rejoinAreaRoom(socket, 2);

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('is a no-op for an admin socket', async () => {
    const socket = fakeSocketWithLeave({ role: 'admin', adminRole: 'area_admin', areaId: 1 }, undefined);

    await rejoinAreaRoom(socket, 2);

    expect(getAreaById).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  // Defense in depth (multi-area audit finding #5): every customers:<areaId>
  // broadcast is non-PII, so this is not a confidentiality control — it just
  // stops a modified client from spamming rejoins to enumerate active areas
  // or thrash room membership. See the comment above rejoinAreaRoom.
  it('stops honoring rejoins past the per-window cap, without erroring', async () => {
    getAreaById.mockResolvedValue({ id: 2, active: 1 });
    const socket = fakeSocketWithLeave({ role: 'customer', id: 42 }, 1);

    for (let i = 0; i < 10; i++) {
      await rejoinAreaRoom(socket, 2);
    }
    expect(socket.join).toHaveBeenCalledTimes(10);

    await rejoinAreaRoom(socket, 2);
    expect(socket.join).toHaveBeenCalledTimes(10); // 11th call in the window is dropped
  });
});
