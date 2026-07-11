/**
 * Unit tests for apps/api/src/utils/riders.js
 * - getRiderForUser / listEligibleRiders / countCompletedDeliveriesToday
 * - selectRiderByLeastOrders (pure, inject random)
 * - syncDeliveryAvailabilityFromRiders
 */

const { pool } = require('../src/db/mysql');
const {
  getRiderForUser,
  listEligibleRiders,
  countCompletedDeliveriesToday,
  selectRiderByLeastOrders,
  countActiveRiders,
  syncDeliveryAvailabilityFromRiders,
  RIDER_HEARTBEAT_TTL_SEC,
} = require('../src/utils/riders');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));

jest.mock('../src/realtime/socket', () => ({
  emitToAllCustomers: jest.fn(),
  emitToCustomer: jest.fn(),
  emitToAdmins: jest.fn(),
}));

jest.mock('../src/utils/shops', () => ({
  syncGlobalShopOpenState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/controllers/settingsController', () => ({
  bustSettingsCache: jest.fn(),
}));

const { emitToAllCustomers } = require('../src/realtime/socket');
const { syncGlobalShopOpenState } = require('../src/utils/shops');
const { bustSettingsCache } = require('../src/controllers/settingsController');

describe('selectRiderByLeastOrders (pure)', () => {
  it('returns null for empty list', () => {
    expect(selectRiderByLeastOrders([])).toBeNull();
    expect(selectRiderByLeastOrders(null)).toBeNull();
  });

  it('returns the only rider', () => {
    const r = { id: 1, completedToday: 5 };
    expect(selectRiderByLeastOrders([r])).toBe(r);
  });

  it('picks the rider with least completedToday', () => {
    const a = { id: 1, completedToday: 3 };
    const b = { id: 2, completedToday: 1 };
    const c = { id: 3, completedToday: 2 };
    expect(selectRiderByLeastOrders([a, b, c])).toBe(b);
  });

  it('breaks ties with injected random', () => {
    const a = { id: 1, completedToday: 0 };
    const b = { id: 2, completedToday: 0 };
    // random → 0 → first candidate
    expect(selectRiderByLeastOrders([a, b], { random: () => 0 })).toBe(a);
    // random → 0.99 → second candidate
    expect(selectRiderByLeastOrders([a, b], { random: () => 0.99 })).toBe(b);
  });

  it('treats missing completedToday as 0', () => {
    const a = { id: 1 };
    const b = { id: 2, completedToday: 1 };
    expect(selectRiderByLeastOrders([a, b])).toBe(a);
  });
});

describe('getRiderForUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null without userId', async () => {
    expect(await getRiderForUser(null)).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns shaped rider when found', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 7,
      user_id: 42,
      display_name: 'Ravi',
      phone: '999',
      active: 1,
      is_online: 1,
      last_heartbeat_at: '2026-07-12T10:00:00Z',
    }]]);

    const rider = await getRiderForUser(42);
    expect(rider).toEqual(expect.objectContaining({
      id: 7,
      userId: 42,
      user_id: 42,
      displayName: 'Ravi',
      display_name: 'Ravi',
      isOnline: true,
      is_online: true,
      active: true,
    }));
  });

  it('returns null when no row', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await getRiderForUser(99)).toBeNull();
  });
});

describe('listEligibleRiders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries without exclude clause when excludeIds empty', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 1, user_id: 10, display_name: 'A', phone: null, active: 1, is_online: 1, last_heartbeat_at: new Date(),
    }]]);

    const list = await listEligibleRiders();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).not.toMatch(/r\.id NOT IN/);
    expect(sql).toContain(`INTERVAL ${RIDER_HEARTBEAT_TTL_SEC} SECOND`);
  });

  it('excludes given rider ids', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    await listEligibleRiders({ excludeIds: [3, 5] });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/r\.id NOT IN/);
    expect(params).toEqual([3, 5]);
  });
});

describe('countCompletedDeliveriesToday', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 0 without riderId', async () => {
    expect(await countCompletedDeliveriesToday(null)).toBe(0);
  });

  it('returns count from DB', async () => {
    pool.query.mockResolvedValueOnce([[{ cnt: 4 }]]);
    expect(await countCompletedDeliveriesToday(9)).toBe(4);
  });
});

describe('countActiveRiders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns numeric count', async () => {
    pool.query.mockResolvedValueOnce([[{ cnt: 2 }]]);
    expect(await countActiveRiders()).toBe(2);
  });
});

describe('syncDeliveryAvailabilityFromRiders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('turns delivery_available ON when active riders > 0 and currently off', async () => {
    pool.query
      .mockResolvedValueOnce([[{ cnt: 1 }]]) // countActiveRiders
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]) // settings
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

    const result = await syncDeliveryAvailabilityFromRiders();

    expect(result.changed).toBe(true);
    expect(result.deliveryAvailable).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE settings SET delivery_available = ? WHERE delivery_available != ?',
      [1, 1]
    );
    expect(bustSettingsCache).toHaveBeenCalled();
    expect(emitToAllCustomers).toHaveBeenCalledWith(
      'settings.delivery_available.updated',
      expect.objectContaining({ deliveryAvailable: true, delivery_available: true })
    );
    expect(syncGlobalShopOpenState).toHaveBeenCalled();
  });

  it('turns delivery_available OFF when zero active riders and currently on', async () => {
    pool.query
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await syncDeliveryAvailabilityFromRiders();

    expect(result.changed).toBe(true);
    expect(result.deliveryAvailable).toBe(false);
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE settings SET delivery_available = ? WHERE delivery_available != ?',
      [0, 0]
    );
    expect(syncGlobalShopOpenState).toHaveBeenCalled();
  });

  it('no-ops when already matching desired state', async () => {
    pool.query
      .mockResolvedValueOnce([[{ cnt: 2 }]])
      .mockResolvedValueOnce([[{ delivery_available: 1 }]]);

    const result = await syncDeliveryAvailabilityFromRiders();

    expect(result.changed).toBe(false);
    expect(bustSettingsCache).not.toHaveBeenCalled();
    expect(syncGlobalShopOpenState).not.toHaveBeenCalled();
  });

  it('returns early when settings row missing', async () => {
    pool.query
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[]]);

    const result = await syncDeliveryAvailabilityFromRiders();
    expect(result.changed).toBe(false);
    expect(syncGlobalShopOpenState).not.toHaveBeenCalled();
  });
});
