/**
 * Unit tests for the rider assignment engine (TASK 5).
 * Focused, isolated mocks — one scenario per test with full mock queues.
 */

const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
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
  syncGlobalShopOpenState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/controllers/settingsController', () => ({
  bustSettingsCache: jest.fn(),
}));

const assignment = require('../src/services/riderAssignment');
const adminInbox = require('../src/utils/adminNotifications');
const { emitToCustomer } = require('../src/realtime/socket');
const { selectRiderByLeastOrders } = require('../src/utils/riders');

function makeConn(queryImpl) {
  const conn = {
    query: typeof queryImpl === 'function' ? jest.fn(queryImpl) : jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  if (Array.isArray(queryImpl)) {
    for (const v of queryImpl) {
      conn.query.mockResolvedValueOnce(v);
    }
  }
  return conn;
}

describe('selectRiderByLeastOrders (engine rule)', () => {
  it('picks least and random on ties', () => {
    expect(selectRiderByLeastOrders([
      { id: 1, completedToday: 3 },
      { id: 2, completedToday: 0 },
    ]).id).toBe(2);
    expect(selectRiderByLeastOrders(
      [{ id: 1, completedToday: 0 }, { id: 2, completedToday: 0 }],
      { random: () => 0 }
    ).id).toBe(1);
  });
});

const resetPool = () => {
  pool.query.mockReset();
  pool.getConnection.mockReset();
  jest.clearAllMocks();
};

describe('startAssignment', () => {
  beforeEach(resetPool);

  it('returns already_in_progress when status is offered', async () => {
    const conn = makeConn([
      [[{ id: 1, status: 'Accepted', rider_id: null, rider_assignment_status: 'offered' }]],
    ]);
    pool.getConnection.mockResolvedValue(conn);

    const result = await assignment.startAssignment(1);
    expect(result).toEqual(expect.objectContaining({
      started: false,
      reason: 'already_in_progress',
    }));
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('fails when no eligible riders', async () => {
    const order = {
      id: 10,
      status: 'Accepted',
      rider_id: null,
      rider_assignment_status: 'none',
      order_number: 'ORD-10',
      payment_method: 'Cash',
      customer_id: 5,
      coupon_id: null,
    };

    const startConn = makeConn([
      [[order]],
      [{ affectedRows: 1 }],
    ]);
    const failConn = makeConn([
      [{ affectedRows: 1 }], // cancel update
      [{ affectedRows: 0 }], // revoke offers
    ]);
    pool.getConnection
      .mockResolvedValueOnce(startConn)
      .mockResolvedValueOnce(failConn);

    // pool.query sequence after start tx:
    // getExcluded, listEligible, fail loadOrder, fail loadOrder after cancel, sync count, sync settings
    pool.query
      .mockResolvedValueOnce([[]]) // excluded
      .mockResolvedValueOnce([[]]) // eligible empty
      .mockResolvedValueOnce([[order]]) // failAssignment loadOrder
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled', rider_assignment_status: 'failed' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]]) // countActiveRiders
      .mockResolvedValueOnce([[{ delivery_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await assignment.startAssignment(10);
    expect(result.started).toBe(true);
    expect(result.failed).toBe(true);
    expect(adminInbox.createAdminNotification).toHaveBeenCalled();
  });
});

describe('acceptOffer', () => {
  beforeEach(resetPool);

  it('409 when offer not pending', async () => {
    const conn = makeConn([
      [[{ id: 1, order_id: 10, rider_id: 3, status: 'rejected', expires_at: new Date(Date.now() + 99999) }]],
    ]);
    pool.getConnection.mockResolvedValue(conn);
    const r = await assignment.acceptOffer(1, 3);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });

  it('forbidden when wrong rider', async () => {
    const conn = makeConn([
      [[{ id: 1, order_id: 10, rider_id: 3, status: 'pending', expires_at: new Date(Date.now() + 99999) }]],
    ]);
    pool.getConnection.mockResolvedValue(conn);
    const r = await assignment.acceptOffer(1, 99);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('FORBIDDEN');
  });

  it('assigns on success', async () => {
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
  });
});

describe('rejectOffer', () => {
  beforeEach(resetPool);

  it('rejects pending offer', async () => {
    const conn = makeConn([
      [[{ id: 1, order_id: 10, rider_id: 3, status: 'pending', expires_at: new Date(Date.now() + 99999) }]],
      [{ affectedRows: 1 }],
    ]);
    pool.getConnection.mockResolvedValueOnce(conn);

    // continueAssignment → loadOrder has rider? no; pending exists? force no more riders
    const order = {
      id: 10, status: 'Accepted', rider_id: null, payment_method: 'Cash',
      customer_id: 1, coupon_id: null, order_number: 'O', rider_assignment_status: 'offered',
    };
    pool.query
      .mockResolvedValueOnce([[order]]) // continue loadOrder
      .mockResolvedValueOnce([[]]) // no pending
      .mockResolvedValueOnce([[{ rider_id: 3 }]]) // excluded
      .mockResolvedValueOnce([[]]) // eligible empty
      .mockResolvedValueOnce([[order]]) // fail loadOrder
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]);

    const failConn = makeConn([
      [{ affectedRows: 1 }],
      [{ affectedRows: 0 }],
    ]);
    pool.getConnection
      .mockResolvedValueOnce(conn)
      .mockResolvedValueOnce(failConn);

    const r = await assignment.rejectOffer(1, 3);
    expect(r.ok).toBe(true);
  });
});

describe('expireOffer', () => {
  beforeEach(resetPool);

  it('returns expired false when CAS misses', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const r = await assignment.expireOffer(1);
    expect(r.expired).toBe(false);
  });

  it('expires and notifies rider', async () => {
    const order = {
      id: 10, status: 'Accepted', rider_id: null, payment_method: 'Cash',
      customer_id: 1, coupon_id: null, order_number: 'O',
    };
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // CAS expire
      .mockResolvedValueOnce([[{ order_id: 10, rider_id: 3 }]])
      .mockResolvedValueOnce([[{ user_id: 7 }]])
      .mockResolvedValueOnce([[order]]) // continue load
      .mockResolvedValueOnce([[]]) // pending
      .mockResolvedValueOnce([[{ rider_id: 3 }]])
      .mockResolvedValueOnce([[]]) // eligible
      .mockResolvedValueOnce([[order]]) // fail load
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]);

    pool.getConnection.mockResolvedValue(makeConn([
      [{ affectedRows: 1 }],
      [{ affectedRows: 0 }],
    ]));

    const r = await assignment.expireOffer(99);
    expect(r.expired).toBe(true);
    expect(emitToCustomer).toHaveBeenCalledWith(7, 'rider.offer.expired', expect.any(Object));
  });
});

describe('cancelAssignmentByRider', () => {
  beforeEach(resetPool);

  it('blocks after pickup', async () => {
    pool.query.mockResolvedValueOnce([[{
      id: 10, rider_id: 3, rider_picked_up_at: '2026-07-12T00:00:00Z', status: 'Preparing',
    }]]);
    const r = await assignment.cancelAssignmentByRider(10, 3);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CANNOT_CANCEL_AFTER_PICKUP');
  });

  it('allows cancel before pickup', async () => {
    const order = {
      id: 10, rider_id: 3, rider_picked_up_at: null, status: 'Accepted',
      order_number: 'O', customer_id: 1, payment_method: 'Cash', coupon_id: null,
    };
    pool.query
      .mockResolvedValueOnce([[order]]) // load in cancel
      .mockResolvedValueOnce([[{ ...order, rider_id: null }]]) // continue load
      .mockResolvedValueOnce([[]]) // pending
      .mockResolvedValueOnce([[{ rider_id: 3 }]])
      .mockResolvedValueOnce([[]]) // eligible
      .mockResolvedValueOnce([[{ ...order, rider_id: null }]])
      .mockResolvedValueOnce([[{ ...order, status: 'Cancelled' }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[{ delivery_available: 0 }]]);

    const c1 = makeConn([
      [{ affectedRows: 1 }],
      [{ affectedRows: 1 }],
    ]);
    const c2 = makeConn([
      [{ affectedRows: 1 }],
      [{ affectedRows: 0 }],
    ]);
    pool.getConnection
      .mockResolvedValueOnce(c1)
      .mockResolvedValueOnce(c2);

    const r = await assignment.cancelAssignmentByRider(10, 3);
    expect(r.ok).toBe(true);
  });
});

describe('maybeStartRiderAssignment', () => {
  beforeEach(resetPool);

  it('waits for all shops', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 10, status: 'Accepted', rider_id: null }]])
      .mockResolvedValueOnce([[
        { shop_id: 1, shop_confirmed_at: 'x', shop_rejected_at: null },
        { shop_id: 2, shop_confirmed_at: null, shop_rejected_at: null },
      ]]);
    const r = await assignment.maybeStartRiderAssignment(10);
    expect(r.started).toBe(false);
    expect(r.reason).toBe('waiting_shops');
  });

  it('returns no_shops for house-only order', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 10, status: 'Accepted', rider_id: null }]])
      .mockResolvedValueOnce([[
        { shop_id: null, shop_confirmed_at: null, shop_rejected_at: null },
      ]]);
    const r = await assignment.maybeStartRiderAssignment(10);
    expect(r.reason).toBe('no_shops');
  });
});

describe('getExcludedRiderIdsForOrder', () => {
  beforeEach(resetPool);

  it('lists rider ids with any offer row', async () => {
    pool.query.mockResolvedValueOnce([[{ rider_id: 1 }, { rider_id: 2 }]]);
    await expect(assignment.getExcludedRiderIdsForOrder(10)).resolves.toEqual([1, 2]);
  });
});

describe('revokeOffersForOrder', () => {
  beforeEach(resetPool);

  it('emits revoked for pending riders', async () => {
    pool.query
      .mockResolvedValueOnce([[{ offer_id: 5, rider_id: 3, user_id: 7 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await assignment.revokeOffersForOrder(10);
    expect(emitToCustomer).toHaveBeenCalledWith(7, 'rider.offer.revoked', expect.objectContaining({
      offerId: 5,
      orderId: 10,
    }));
  });
});
