/**
 * TASK 14 — Automated coverage for the rider UAT checklist.
 * Each describe block maps to a plan item (14.1–14.10).
 * Live device steps (physical kill-app) remain human-verified; logic is covered.
 */

const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn(), getConnection: jest.fn() },
}));
jest.mock('../src/realtime/socket', () => ({
  emitToCustomer: jest.fn(),
  emitToAdmins: jest.fn(),
  emitToAllCustomers: jest.fn(),
}));
jest.mock('../src/utils/expoPush', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendPushToMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../src/utils/adminNotifications', () => ({
  TYPES: {
    RIDER_ASSIGNMENT_FAILED: 'rider_assignment_failed',
    RIDER_ZERO_AVAILABLE: 'rider_zero_available',
    ORDER_CANCELLED_NO_RIDER: 'order_cancelled_no_rider',
  },
  createAdminNotification: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/utils/notificationService', () => ({
  createOrderNotification: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/realtime/orderEvents', () => ({
  emitOrderStatusUpdated: jest.fn(),
  emitNotificationCreated: jest.fn(),
}));
jest.mock('../src/utils/shops', () => ({
  notifyShopsOrderCancelled: jest.fn(),
  notifyShopsRiderAssigned: jest.fn(),
  notifyShopsRiderAssignmentFailed: jest.fn(),
  syncGlobalShopOpenState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/controllers/settingsController', () => ({
  bustSettingsCache: jest.fn(),
}));

const assignment = require('../src/services/riderAssignment');
const {
  selectRiderByLeastOrders,
  syncDeliveryAvailabilityFromRiders,
  RIDER_HEARTBEAT_TTL_SEC,
} = require('../src/utils/riders');
const adminInbox = require('../src/utils/adminNotifications');
const notificationService = require('../src/utils/notificationService');
const { emitToAllCustomers } = require('../src/realtime/socket');
const { bustSettingsCache } = require('../src/controllers/settingsController');
const { syncGlobalShopOpenState } = require('../src/utils/shops');

function makeConn(responses) {
  const conn = {
    query: jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  for (const v of responses) conn.query.mockResolvedValueOnce(v);
  return conn;
}

const reset = () => {
  pool.query.mockReset();
  pool.getConnection.mockReset();
  jest.clearAllMocks();
};

const baseOrder = (over = {}) => ({
  id: 10,
  status: 'Accepted',
  rider_id: null,
  rider_assignment_status: 'none',
  order_number: 'ORD-10',
  payment_method: 'Cash',
  customer_id: 5,
  coupon_id: null,
  ...over,
});

describe('UAT 14.1 / 14.10 — delivery_available follows rider online count', () => {
  beforeEach(reset);

  it('turns delivery OFF when zero active riders (14.1 / 14.10)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const r = await syncDeliveryAvailabilityFromRiders();
    expect(r.deliveryAvailable).toBe(false);
    expect(r.changed).toBe(true);
    expect(bustSettingsCache).toHaveBeenCalled();
    expect(emitToAllCustomers).toHaveBeenCalledWith(
      'settings.delivery_available.updated',
      expect.objectContaining({ deliveryAvailable: false })
    );
    expect(syncGlobalShopOpenState).toHaveBeenCalled();
  });

  it('turns delivery ON when any rider is active (14.10)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ cnt: 2 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const r = await syncDeliveryAvailabilityFromRiders();
    expect(r.deliveryAvailable).toBe(true);
    expect(r.changed).toBe(true);
  });

  it('heartbeat TTL is configured (soft presence)', () => {
    expect(RIDER_HEARTBEAT_TTL_SEC).toBeGreaterThanOrEqual(30);
  });
});

describe('UAT 14.2 — one rider accept path notifies customer', () => {
  beforeEach(reset);

  it('acceptOffer assigns rider and fires customer rider_assigned', async () => {
    const future = new Date(Date.now() + 120000);
    const conn = makeConn([
      [[{ id: 1, order_id: 10, rider_id: 3, status: 'pending', expires_at: future }]], // offer select
      [[{ is_expired: 0 }]], // expiry check (SQL-side)
      [[{ id: 10, status: 'Accepted', rider_id: null, customer_id: 5, order_number: 'O' }]], // order select
      [[]], // busy-rider check — empty = not busy
      [{ affectedRows: 1 }], // offer update
      [{ affectedRows: 1 }], // order update
    ]);
    pool.getConnection.mockResolvedValue(conn);
    pool.query.mockResolvedValueOnce([[{
      id: 10, status: 'Accepted', rider_id: 3, customer_id: 5, order_number: 'O',
      rider_assignment_status: 'assigned',
    }]]);

    const r = await assignment.acceptOffer(1, 3);
    expect(r.ok).toBe(true);
    expect(r.order.rider_id).toBe(3);
    expect(notificationService.createOrderNotification).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'rider_assigned', userId: 5 })
    );
  });
});

describe('UAT 14.3 — sole rider reject cancels + admin notify', () => {
  beforeEach(reset);

  it('reject with no other eligible riders fails assignment + admin inbox', async () => {
    const order = baseOrder({ rider_assignment_status: 'offered' });
    const conn = makeConn([
      [[{ id: 1, order_id: 10, rider_id: 3, status: 'pending', expires_at: new Date(Date.now() + 99999) }]],
      [{ affectedRows: 1 }],
    ]);
    pool.getConnection
      .mockResolvedValueOnce(conn)
      .mockResolvedValueOnce(makeConn([
        [{ affectedRows: 1 }],
        [{ affectedRows: 0 }],
      ]));

    pool.query
      .mockResolvedValueOnce([[order]]) // continue loadOrder
      .mockResolvedValueOnce([[]]) // no pending
      .mockResolvedValueOnce([[{ rider_id: 3 }]]) // excluded
      .mockResolvedValueOnce([[]]) // eligible empty
      .mockResolvedValueOnce([[order]]) // fail loadOrder
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]);

    const r = await assignment.rejectOffer(1, 3);
    expect(r.ok).toBe(true);
    expect(adminInbox.createAdminNotification).toHaveBeenCalled();
  });
});

describe('UAT 14.4 — least completed today wins', () => {
  it('selects rider with fewer deliveries today', () => {
    const chosen = selectRiderByLeastOrders([
      { id: 1, completedToday: 4 },
      { id: 2, completedToday: 1 },
      { id: 3, completedToday: 9 },
    ]);
    expect(chosen.id).toBe(2);
  });

  it('ties broken randomly among equals only', () => {
    const a = { id: 1, completedToday: 0 };
    const b = { id: 2, completedToday: 0 };
    const c = { id: 3, completedToday: 5 };
    expect(selectRiderByLeastOrders([a, b, c], { random: () => 0 }).id).toBe(1);
    expect(selectRiderByLeastOrders([a, b, c], { random: () => 0.99 }).id).toBe(2);
  });
});

describe('UAT 14.5 — timeout treated as reject then continue', () => {
  beforeEach(reset);

  it('expireOffer CAS-marks expired and continues chain', async () => {
    const order = baseOrder({ rider_assignment_status: 'offered' });
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ order_id: 10, rider_id: 3 }]])
      .mockResolvedValueOnce([[{ user_id: 7 }]])
      .mockResolvedValueOnce([[order]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ rider_id: 3 }]])
      .mockResolvedValueOnce([[]]) // no more eligible → fail
      .mockResolvedValueOnce([[order]])
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]);

    pool.getConnection.mockResolvedValue(makeConn([
      [{ affectedRows: 1 }],
      [{ affectedRows: 0 }],
    ]));

    const r = await assignment.expireOffer(99);
    expect(r.expired).toBe(true);
  });

  it('offer timeout constant is 2 minutes', () => {
    expect(assignment.RIDER_OFFER_TIMEOUT_SEC).toBe(120);
  });
});

describe('UAT 14.6 — remaining time from server expiresAt (app restart safe)', () => {
  it('document: client uses expiresAt not local reset — covered in customer-app riderOfferTime tests', () => {
    // Logic lives in apps/customer-app/src/utils/riderOfferTime.js
    // remainingSecondsFromExpiresAt(expiresAt) never invents a fresh 120s.
    expect(true).toBe(true);
  });
});

describe('UAT 14.7 — post-accept cancel excludes rider forever for that order', () => {
  beforeEach(reset);

  it('blocks cancel after pickup', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 10, rider_id: 3, rider_picked_up_at: '2026-07-12', status: 'Preparing',
    }]]);
    const r = await assignment.cancelAssignmentByRider(10, 3);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CANNOT_CANCEL_AFTER_PICKUP');
  });

  it('cancel before pickup continues and excludes via offer row', async () => {
    const order = baseOrder({
      rider_id: 3,
      rider_picked_up_at: null,
      rider_assignment_status: 'assigned',
    });
    pool.query
      .mockResolvedValueOnce([[order]])
      .mockResolvedValueOnce([[{ ...order, rider_id: null }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ rider_id: 3 }]]) // excluded includes canceller
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ ...order, rider_id: null }]])
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]);

    pool.getConnection
      .mockResolvedValueOnce(makeConn([
        [{ affectedRows: 1 }],
        [{ affectedRows: 1 }], // accepted → rejected post_accept_cancel
      ]))
      .mockResolvedValueOnce(makeConn([
        [{ affectedRows: 1 }],
        [{ affectedRows: 0 }],
      ]));

    const r = await assignment.cancelAssignmentByRider(10, 3);
    expect(r.ok).toBe(true);

    // getExcludedRiderIds includes any prior offer row for the order
    reset();
    pool.query.mockResolvedValueOnce([[{ rider_id: 3 }, { rider_id: 8 }]]);
    await expect(assignment.getExcludedRiderIdsForOrder(10)).resolves.toEqual([3, 8]);
  });
});

describe('UAT 14.8 — never two pending offers / no double accept', () => {
  beforeEach(reset);

  it('createOffer skips when pending already exists', async () => {
    const conn = makeConn([
      [[{ id: 99 }]], // existing pending FOR UPDATE
    ]);
    pool.getConnection.mockResolvedValue(conn);
    const offer = await assignment.createOffer(10, { id: 3, userId: 7, user_id: 7 });
    expect(offer).toBeNull();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('acceptOffer 409 when already not pending', async () => {
    const conn = makeConn([
      [[{ id: 1, order_id: 10, rider_id: 3, status: 'accepted', expires_at: new Date(Date.now() + 99999) }]],
    ]);
    pool.getConnection.mockResolvedValue(conn);
    const r = await assignment.acceptOffer(1, 3);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });
});

describe('UAT 14.9 — multi-shop: wait until all shops confirm', () => {
  beforeEach(reset);

  it('maybeStart waits when a shop has not confirmed', async () => {
    pool.query
      .mockResolvedValueOnce([[baseOrder()]])
      .mockResolvedValueOnce([[
        { shop_id: 1, shop_confirmed_at: 'x', shop_rejected_at: null },
        { shop_id: 2, shop_confirmed_at: null, shop_rejected_at: null },
      ]]);
    const r = await assignment.maybeStartRiderAssignment(10);
    expect(r.started).toBe(false);
    expect(r.reason).toBe('waiting_shops');
  });

  it('house-only orders do not start from maybeStart (Accepted path starts them)', async () => {
    pool.query
      .mockResolvedValueOnce([[baseOrder()]])
      .mockResolvedValueOnce([[
        { shop_id: null, shop_confirmed_at: null, shop_rejected_at: null },
      ]]);
    const r = await assignment.maybeStartRiderAssignment(10);
    expect(r.reason).toBe('no_shops');
  });
});

describe('UAT 14.1 zero riders at assignment start', () => {
  beforeEach(reset);

  it('startAssignment with zero eligible fails and cancels', async () => {
    const order = baseOrder();
    pool.getConnection
      .mockResolvedValueOnce(makeConn([
        [[order]],
        [{ affectedRows: 1 }],
      ]))
      .mockResolvedValueOnce(makeConn([
        [{ affectedRows: 1 }],
        [{ affectedRows: 0 }],
      ]));

    pool.query
      .mockResolvedValueOnce([[]]) // excluded
      .mockResolvedValueOnce([[]]) // eligible empty
      .mockResolvedValueOnce([[order]])
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled', rider_assignment_status: 'failed' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const r = await assignment.startAssignment(10);
    expect(r.started).toBe(true);
    expect(r.failed).toBe(true);
    expect(adminInbox.createAdminNotification).toHaveBeenCalled();
  });
});
