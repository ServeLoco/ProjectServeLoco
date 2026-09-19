// Order-path concurrency against a REAL MySQL: the coupon FOR UPDATE lock, the
// compare-and-set 409s on order status/payment, and the unique
// idx_orders_idempotency index.
//
// Every one of those is a guarantee the DATABASE makes, not our JavaScript. A
// mocked pool (which every other test file in this directory's parent uses)
// returns whatever the test hands it, so it can confirm the code issues the
// right query but never that MySQL actually serializes, actually reports
// affectedRows = 0, or actually rejects a duplicate key.
//
// All three areas live in ONE file on purpose. Jest runs test files in
// parallel workers but the tests inside a file serially, and these tests hold
// real row and gap locks on `orders` and `coupons`. Split across files they
// intermittently blocked each other's fixture inserts — a flaky suite that
// looked like a product bug. One file makes the locking strictly sequential.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Everything the status/payment handlers reach for AFTER the database write —
// push notifications, socket fan-out, the shop ring-out, rider assignment.
// Each factory replaces every exported FUNCTION with a promise-returning
// jest.fn and keeps non-function exports (constants the controllers read) as
// they are, so the mocks can't fall out of step with the real modules the way
// a hand-listed set of keys does. The database is the one dependency these
// tests want real.
const mockedModule = (modulePath) => {
  const actual = jest.requireActual(modulePath);
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => [
      key,
      typeof value === 'function' ? jest.fn().mockResolvedValue(null) : value,
    ])
  );
};

jest.mock('../../src/utils/notificationService', () => mockedModule('../../src/utils/notificationService'));
jest.mock('../../src/realtime/orderEvents', () => mockedModule('../../src/realtime/orderEvents'));
jest.mock('../../src/realtime/socket', () => mockedModule('../../src/realtime/socket'));
jest.mock('../../src/utils/shops', () => mockedModule('../../src/utils/shops'));
jest.mock('../../src/services/riderAssignment', () => mockedModule('../../src/services/riderAssignment'));
jest.mock('../../src/realtime/orderAutoAccept', () => mockedModule('../../src/realtime/orderAutoAccept'));
jest.mock('../../src/utils/adminNotifications', () => mockedModule('../../src/utils/adminNotifications'));

const {
  DB_TESTS_ENABLED,
  describeWithMysql,
  assertMysqlReady,
  pool,
  sleep,
  FIXTURE_TAG,
  createUser,
  createCoupon,
  createOrderRow,
  addRedemption,
  cleanupFixtures,
  shortenLockWait,
  restoreSessionSettings,
} = require('../helpers/realMysql');

const { validateCoupon } = require('../../src/utils/coupons');
const { recheckUsageUnderLock, generateOrderNumber } = require('../../src/controllers/orderController');

const adminRoutes = require('../../src/routes/adminRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

// requireAdmin only verifies the JWT under NODE_ENV=test (the live admins-row
// re-check is skipped), so a signed token with an areaId is a complete
// area_admin session for these routes. Area 1 is the area migrate.js seeds.
const adminToken = jwt.sign(
  { id: 'admin', role: 'admin', adminRole: 'area_admin', areaId: 1 },
  process.env.JWT_SECRET
);

const patchStatus = (orderId, body) => request(app)
  .patch(`/api/admin/orders/${orderId}/status`)
  .set('Authorization', `Bearer ${adminToken}`)
  .send(body);

const patchPayment = (orderId, body) => request(app)
  .patch(`/api/admin/orders/${orderId}/payment`)
  .set('Authorization', `Bearer ${adminToken}`)
  .send(body);

const readOrder = async (orderId) => {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows[0];
};


// How long to let a blocked transaction sit before concluding it really is
// blocked. Long enough that a merely-slow query isn't mistaken for a lock
// wait, short enough not to pad the suite.
const LOCK_OBSERVE_MS = 400;

let orderSeq = 0;
const insertWithKey = (connectionOrPool, customerId, idempotencyKey) => connectionOrPool.query(
  `INSERT INTO orders
     (order_number, customer_id, customer_name, phone, address,
      subtotal, delivery_charge, total, idempotency_key, idempotency_key_created_at, area_id)
   VALUES (?, ?, ?, '7000000000', '1 Test Street', 100, 0, 100, ?, NOW(), 1)`,
  [`${FIXTURE_TAG}-${process.pid}-${(orderSeq += 1)}`, customerId, `${FIXTURE_TAG} Customer`, idempotencyKey]
);

// --------------------------------------------------------------------------
describeWithMysql('coupon redemption concurrency (real MySQL)', () => {
  let connections = [];

  // Mirrors how createOrder opens its transaction, isolation level included —
  // the coupon guard's correctness depends on that level, so a test that
  // opened a default-isolation transaction would be testing a different
  // thing than production runs.
  const openTransaction = async ({ isolation = 'READ COMMITTED' } = {}) => {
    const connection = await pool.getConnection();
    connections.push(connection);
    if (isolation) {
      await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    }
    await connection.beginTransaction();
    return connection;
  };

  beforeAll(async () => {
    await assertMysqlReady();
    await cleanupFixtures();
  });

  afterEach(async () => {
    // Release every connection this test opened BEFORE deleting fixtures —
    // an uncommitted transaction still holds row locks the DELETE would
    // block on.
    for (const connection of connections) {
      try {
        await connection.rollback();
      } catch {
        // already unusable
      }
      await restoreSessionSettings(connection);
      connection.release();
    }
    connections = [];
    await cleanupFixtures();
  });

  it('serializes two checkouts on the same coupon: the second blocks until the first commits', async () => {
    const userA = await createUser('A');
    const coupon = await createCoupon({ totalUsageLimit: 1 });
    const orderA = await createOrderRow(userA);

    const connA = await openTransaction();
    const connB = await openTransaction();

    await connA.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);

    let bAcquiredLock = false;
    const bLock = connB
      .query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id])
      .then(() => { bAcquiredLock = true; });

    await sleep(LOCK_OBSERVE_MS);
    // This is the assertion a mock can never make: B is genuinely parked in
    // an InnoDB lock wait, not merely ordered after A by the event loop.
    expect(bAcquiredLock).toBe(false);

    await connA.query(
      'INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?, ?, ?, 25)',
      [coupon.id, userA, orderA]
    );
    await connA.commit();

    await bLock;
    expect(bAcquiredLock).toBe(true);
  });

  it('does not serialize checkouts on two different coupons', async () => {
    const couponOne = await createCoupon({ totalUsageLimit: 1 });
    const couponTwo = await createCoupon({ totalUsageLimit: 1 });

    const connA = await openTransaction();
    const connB = await openTransaction();

    await connA.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [couponOne.id]);

    // The lock is on one coupon ROW, so a checkout on a different coupon must
    // sail straight through. If this ever starts blocking, the lock has been
    // widened (a table lock, or a range scan instead of a PK lookup) and every
    // concurrent checkout on the platform now queues behind one coupon.
    await shortenLockWait(connB);
    await expect(
      connB.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [couponTwo.id])
    ).resolves.toBeDefined();
  });

  it('reports the global limit when the redemption that filled it committed before the lock was taken', async () => {
    const userA = await createUser('A');
    const userB = await createUser('B');
    const coupon = await createCoupon({ totalUsageLimit: 1 });
    const orderA = await createOrderRow(userA);
    await addRedemption(coupon.id, userA, orderA);

    // Sequential, not concurrent: B's transaction starts after A's redemption
    // is already committed, so B's snapshot contains it. This is the baseline
    // the concurrent case below is compared against.
    const connB = await openTransaction();
    const [couponRows] = await connB.query('SELECT * FROM coupons WHERE id = ?', [coupon.id]);
    await connB.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);

    const reason = await recheckUsageUnderLock(connB, couponRows[0], userB);
    expect(reason).toMatch(/maximum usage limit/i);
  });

  it('reports the per-user limit for the same user but clears a different user', async () => {
    const userA = await createUser('A');
    const userB = await createUser('B');
    const coupon = await createCoupon({ perUserUsageLimit: 1 });
    const orderA = await createOrderRow(userA);
    await addRedemption(coupon.id, userA, orderA);

    const connection = await openTransaction();
    const [couponRows] = await connection.query('SELECT * FROM coupons WHERE id = ?', [coupon.id]);
    await connection.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);

    await expect(recheckUsageUnderLock(connection, couponRows[0], userA))
      .resolves.toMatch(/already used this coupon/i);
    await expect(recheckUsageUnderLock(connection, couponRows[0], userB))
      .resolves.toBeNull();
  });

  it('frees the quota again once the redemption is soft-cancelled', async () => {
    const user = await createUser('A');
    const coupon = await createCoupon({ totalUsageLimit: 1, perUserUsageLimit: 1 });
    const order = await createOrderRow(user, { couponId: coupon.id });
    const redemptionId = await addRedemption(coupon.id, user, order);

    const recheckOnce = async () => {
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM coupons WHERE id = ?', [coupon.id]);
        await connection.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);
        return await recheckUsageUnderLock(connection, rows[0], user);
      } finally {
        // Must end before the UPDATE below: InnoDB takes a shared lock on the
        // referenced coupons row to verify coupon_redemptions' foreign key, so
        // an open FOR UPDATE on that row blocks the cancel entirely.
        await connection.rollback();
        connection.release();
      }
    };

    expect(await recheckOnce()).toMatch(/already used this coupon/i);

    // Same soft-cancel the customer and admin cancel paths perform.
    await pool.query("UPDATE coupon_redemptions SET status = 'cancelled' WHERE id = ?", [redemptionId]);

    expect(await recheckOnce()).toBeNull();
  });

  it('shows the recheck is what catches an over-redemption, not validateCoupon alone', async () => {
    const userA = await createUser('A');
    const userB = await createUser('B');
    const coupon = await createCoupon({ totalUsageLimit: 1 });
    const orderA = await createOrderRow(userA);
    await addRedemption(coupon.id, userA, orderA);

    const connection = await openTransaction();
    const result = await validateCoupon({
      code: coupon.code,
      subtotal: 500,
      deliveryCharge: 0,
      userId: userB,
      connection,
      areaId: 1,
    });

    // validateCoupon runs the same limit checks, so on already-committed data
    // it rejects too. The point of the lock + recheck is the data that is NOT
    // yet committed when validateCoupon runs — covered by the test below.
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/maximum usage limit/i);
  });

  // The regression test for the over-redemption bug: two checkouts race for a
  // one-use coupon, the loser waits on the `FOR UPDATE`, and its recheck must
  // see what the winner committed while it waited.
  //
  // This is what READ COMMITTED on createOrder's transaction buys (see the
  // comment at the top of that function). Under InnoDB's default REPEATABLE
  // READ it fails: the loser's snapshot was fixed by its own earlier reads, so
  // recheckUsageUnderLock counts zero redemptions and clears the checkout, and
  // both orders consume the coupon. The lock serializes them either way — the
  // isolation level is what makes the read it guards meaningful.
  //
  // The transaction below sets the isolation level itself rather than going
  // through createOrder, because it drives the coupon sequence directly; the
  // point is that this is the isolation level createOrder runs at.
  it('rejects the second of two truly concurrent checkouts on a one-use coupon', async () => {
    const userA = await createUser('A');
    const userB = await createUser('B');
    const coupon = await createCoupon({ totalUsageLimit: 1 });
    const orderA = await createOrderRow(userA);

    const connA = await openTransaction();
    const connB = await openTransaction();

    // Both checkouts validate first, exactly as createOrder does. These reads
    // are what pin each transaction's snapshot.
    const [resultA, resultB] = await Promise.all([
      validateCoupon({ code: coupon.code, subtotal: 500, deliveryCharge: 0, userId: userA, connection: connA, areaId: 1 }),
      validateCoupon({ code: coupon.code, subtotal: 500, deliveryCharge: 0, userId: userB, connection: connB, areaId: 1 }),
    ]);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    // A wins the lock, redeems, commits.
    await connA.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);
    expect(await recheckUsageUnderLock(connA, resultA.coupon, userA)).toBeNull();

    const bLock = connB.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);
    await sleep(LOCK_OBSERVE_MS);

    await connA.query(
      'INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?, ?, ?, 25)',
      [coupon.id, userA, orderA]
    );
    await connA.commit();
    await bLock;

    // B now holds the lock and A's redemption is committed, so the recheck
    // must refuse B. It does not.
    const reasonB = await recheckUsageUnderLock(connB, resultB.coupon, userB);
    expect(reasonB).toMatch(/maximum usage limit/i);
  });

  it('would over-redeem again if the transaction ran at REPEATABLE READ', async () => {
    const userA = await createUser('A');
    const userB = await createUser('B');
    const coupon = await createCoupon({ totalUsageLimit: 1 });
    const orderA = await createOrderRow(userA);

    // Same race as the test above, run at InnoDB's DEFAULT isolation level to
    // pin down what is actually doing the work. If someone drops the
    // `SET TRANSACTION ISOLATION LEVEL READ COMMITTED` from createOrder, this
    // is the behaviour they get back: the lock still serializes, the recheck
    // still runs, and the coupon is still consumed twice. This test failing
    // means REPEATABLE READ started behaving like READ COMMITTED, which would
    // make the test above pass for a reason it does not claim.
    const connA = await openTransaction({ isolation: 'REPEATABLE READ' });
    const connB = await openTransaction({ isolation: 'REPEATABLE READ' });

    const [resultA, resultB] = await Promise.all([
      validateCoupon({ code: coupon.code, subtotal: 500, deliveryCharge: 0, userId: userA, connection: connA, areaId: 1 }),
      validateCoupon({ code: coupon.code, subtotal: 500, deliveryCharge: 0, userId: userB, connection: connB, areaId: 1 }),
    ]);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    await connA.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);
    const bLock = connB.query('SELECT id FROM coupons WHERE id = ? FOR UPDATE', [coupon.id]);
    await sleep(LOCK_OBSERVE_MS);

    await connA.query(
      'INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?, ?, ?, 25)',
      [coupon.id, userA, orderA]
    );
    await connA.commit();
    await bLock;

    // The stale snapshot: B holds the lock, A's redemption is committed, and
    // B still sees none of it.
    await expect(recheckUsageUnderLock(connB, resultB.coupon, userB)).resolves.toBeNull();
  });
});

describeWithMysql('order compare-and-set concurrency (real MySQL)', () => {
  beforeAll(async () => {
    await assertMysqlReady();
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  // Forces both requests to read the order BEFORE either one writes it, which
  // is the only interleaving that exercises the compare-and-set predicate. Left
  // to chance the two just serialize — the second request reads the status the
  // first already wrote and advances legitimately — so the race is pinned here
  // with a real row lock rather than with sleeps and hope: a transaction holds
  // `orders.id` exclusively, both handlers get past their non-locking SELECT,
  // both park on the UPDATE, and releasing the lock runs them back to back.
  const raceOnLockedOrder = async (orderId, sendFirst, sendSecond = sendFirst) => {
    const holder = await pool.getConnection();
    let settled = 0;
    try {
      await holder.beginTransaction();
      await holder.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);

      const first = sendFirst().then((res) => { settled += 1; return res; });
      const second = sendSecond().then((res) => { settled += 1; return res; });

      await sleep(400);
      // Both are parked in an InnoDB lock wait on their UPDATE. If either had
      // already answered, the rest of the assertions would be about a
      // sequential pair, not a race.
      expect(settled).toBe(0);

      await holder.rollback();
      return Promise.all([first, second]);
    } finally {
      holder.release();
    }
  };

  it('lets exactly one of two simultaneous status writes through, and 409s the other', async () => {
    const user = await createUser('A');
    const orderId = await createOrderRow(user, { status: 'Pending' });

    const [first, second] = await raceOnLockedOrder(
      orderId,
      () => patchStatus(orderId, { status: 'Accepted' })
    );

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);

    const loser = first.statusCode === 409 ? first : second;
    expect(loser.body.code).toBe('CONCURRENCY_CONFLICT');
    // The 409 body must carry the order as it actually is now, so the admin
    // UI can re-render instead of leaving a stale row on screen.
    expect(loser.body.order).toBeDefined();
    expect(loser.body.order.id).toBe(orderId);
    expect(loser.body.order.status).toBe('Accepted');

    expect((await readOrder(orderId)).status).toBe('Accepted');
  });

  it('never blends two different concurrent transitions, whichever wins', async () => {
    const user = await createUser('A');
    const orderId = await createOrderRow(user, { status: 'Pending' });

    // Unpinned on purpose: with two different targets the pair may race (the
    // loser 409s) or serialize (the loser reads the new status and is refused
    // by the forward-only guard with a 400). Both are correct; what must hold
    // in every interleaving is that one write lands whole and the other lands
    // not at all.
    const [first, second] = await Promise.all([
      patchStatus(orderId, { status: 'Accepted' }),
      patchStatus(orderId, { status: 'Preparing' }),
    ]);

    const results = [first, second];
    const winners = results.filter((res) => res.statusCode === 200);
    expect(winners).toHaveLength(1);
    const loserCode = results.find((res) => res.statusCode !== 200).statusCode;
    expect([400, 409]).toContain(loserCode);

    const stored = await readOrder(orderId);
    expect(stored.status).toBe(winners[0].body.order.status);
    expect(['Accepted', 'Preparing']).toContain(stored.status);
  });

  it('lets exactly one of two simultaneous payment writes through, and 409s the other', async () => {
    const user = await createUser('A');
    const orderId = await createOrderRow(user, { status: 'Accepted', paymentStatus: 'Pending' });

    const [first, second] = await raceOnLockedOrder(
      orderId,
      () => patchPayment(orderId, { payment_status: 'Paid' }),
      () => patchPayment(orderId, { payment_status: 'Failed' })
    );

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);

    const winner = first.statusCode === 200 ? first : second;
    const stored = await readOrder(orderId);
    expect(stored.payment_status).toBe(winner.body.order.payment_status);
    expect(['Paid', 'Failed']).toContain(stored.payment_status);
  });

  it('answers 200, not a bogus 409, when the payment status is already the requested value', async () => {
    const user = await createUser('A');
    const orderId = await createOrderRow(user, { status: 'Accepted', paymentStatus: 'Paid' });

    // MySQL reports affectedRows = 0 for an UPDATE that sets a column to the
    // value it already holds — indistinguishable from losing a CAS race. The
    // controller short-circuits ahead of the UPDATE for exactly this reason;
    // only a real server exercises it.
    const res = await patchPayment(orderId, { payment_status: 'Paid' });

    expect(res.statusCode).toBe(200);
    expect(res.body.order.payment_status).toBe('Paid');
    expect((await readOrder(orderId)).payment_status).toBe('Paid');
  });

  it('leaves no half-applied state when a cancel and an advance race', async () => {
    const user = await createUser('A');
    const coupon = await createCoupon({ totalUsageLimit: 5 });
    const orderId = await createOrderRow(user, { status: 'Pending', couponId: coupon.id, paymentMethod: 'UPI' });
    await addRedemption(coupon.id, user, orderId);

    const [cancel, advance] = await raceOnLockedOrder(
      orderId,
      () => patchStatus(orderId, { status: 'Cancelled', cancel_reason: 'out_of_stock' }),
      () => patchStatus(orderId, { status: 'Accepted' })
    );

    expect([cancel.statusCode, advance.statusCode].sort()).toEqual([200, 409]);

    const stored = await readOrder(orderId);
    const [redemptions] = await pool.query(
      'SELECT status FROM coupon_redemptions WHERE order_id = ?',
      [orderId]
    );

    if (stored.status === 'Cancelled') {
      // The cancel commits the status flip, the UPI refund marker and the
      // coupon-quota release in ONE transaction, so all three must agree.
      expect(stored.payment_status).toBe('Refunded');
      expect(stored.cancel_reason).toBeTruthy();
      expect(redemptions.map((row) => row.status)).toEqual(['cancelled']);
    } else {
      expect(stored.status).toBe('Accepted');
      expect(stored.cancel_reason).toBeNull();
      // The losing cancel rolled back its whole transaction, so the customer
      // keeps the redemption — a released quota on a live order would be a
      // free coupon use.
      expect(redemptions.map((row) => row.status)).toEqual(['active']);
    }
  });

  it('re-reads the status so an out-of-band change is not mistaken for a conflict', async () => {
    const user = await createUser('A');
    const orderId = await createOrderRow(user, { status: 'Pending' });

    expect((await patchStatus(orderId, { status: 'Accepted' })).statusCode).toBe(200);
    // Out-of-band change, as the auto-accept worker or a rider app would make.
    await pool.query("UPDATE orders SET status = 'Preparing' WHERE id = ?", [orderId]);

    // The CAS predicate is built from the status this request itself just
    // read, not from a cached one, so a later request still succeeds after
    // someone else moved the order forward.
    const res = await patchStatus(orderId, { status: 'Out for Delivery' });
    expect(res.statusCode).toBe(200);
    expect((await readOrder(orderId)).status).toBe('Out for Delivery');
  });

  it('keeps another area\'s order out of reach even when the id is guessed right', async () => {
    const user = await createUser('A');
    const orderId = await createOrderRow(user, { status: 'Pending' });

    // Same order id, an admin scoped to an area that does not own it. The
    // area predicate rides on the same CAS UPDATE, so this must 404 on the
    // read rather than 409 or succeed.
    const otherAreaToken = jwt.sign(
      { id: 'admin9', role: 'admin', adminRole: 'area_admin', areaId: 999 },
      process.env.JWT_SECRET
    );
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${otherAreaToken}`)
      .send({ status: 'Accepted' });

    expect(res.statusCode).toBe(404);
    expect((await readOrder(orderId)).status).toBe('Pending');
  });
});

describeWithMysql('order idempotency index concurrency (real MySQL)', () => {
  beforeAll(async () => {
    await assertMysqlReady();
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it('carries a UNIQUE index on (customer_id, idempotency_key) after migration', async () => {
    const [rows] = await pool.query(
      `SELECT NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
          AND INDEX_NAME = 'idx_orders_idempotency'
        ORDER BY SEQ_IN_INDEX`
    );

    // migrate.js drops a non-unique predecessor before adding this one. A
    // non-unique index here would leave duplicate-submit protection resting
    // on the pre-check alone, which two simultaneous requests can both pass.
    expect(rows.map((row) => row.COLUMN_NAME)).toEqual(['customer_id', 'idempotency_key']);
    expect(rows.every((row) => Number(row.NON_UNIQUE) === 0)).toBe(true);
  });

  it('rejects a second order with the same key for the same customer', async () => {
    const customerId = await createUser('A');
    await insertWithKey(pool, customerId, 'replay-key-1');

    await expect(insertWithKey(pool, customerId, 'replay-key-1')).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
      errno: 1062,
    });
  });

  it('names idx_orders_idempotency in the duplicate-key error the controller matches on', async () => {
    const customerId = await createUser('A');
    await insertWithKey(pool, customerId, 'replay-key-2');

    // createOrder tells its replay path apart from any other duplicate key
    // (an order_number collision, say) with
    // `insertErr.message.includes('idx_orders_idempotency')`. That string
    // match is a real coupling to MySQL's error text: if the index is ever
    // renamed, or the server stops naming it, the replay branch silently
    // stops firing and a duplicate submit 500s instead.
    const error = await insertWithKey(pool, customerId, 'replay-key-2').catch((err) => err);
    expect(error.message).toContain('idx_orders_idempotency');
  });

  it('lets a different customer reuse the same key', async () => {
    const customerA = await createUser('A');
    const customerB = await createUser('B');

    await insertWithKey(pool, customerA, 'shared-key');
    // The index is scoped per customer, so two customers whose clients
    // generate the same key must not block each other.
    await expect(insertWithKey(pool, customerB, 'shared-key')).resolves.toBeDefined();
  });

  it('still allows many orders with no idempotency key at all', async () => {
    const customerId = await createUser('A');

    // Most orders carry no key. MySQL permits repeated NULLs in a unique
    // index, which is the only reason the index can be unique without
    // capping keyless customers at one order — migrate.js's comment says so
    // and this is what checks it.
    await insertWithKey(pool, customerId, null);
    await insertWithKey(pool, customerId, null);
    await expect(insertWithKey(pool, customerId, null)).resolves.toBeDefined();

    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM orders WHERE customer_id = ? AND idempotency_key IS NULL',
      [customerId]
    );
    expect(Number(rows[0].count)).toBe(3);
  });

  it('admits exactly one of two simultaneous inserts of the same key', async () => {
    const customerId = await createUser('A');

    const [first, second] = await Promise.allSettled([
      insertWithKey(pool, customerId, 'concurrent-key'),
      insertWithKey(pool, customerId, 'concurrent-key'),
    ]);

    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
    const rejected = [first, second].filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('ER_DUP_ENTRY');

    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM orders WHERE customer_id = ? AND idempotency_key = ?',
      [customerId, 'concurrent-key']
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it('blocks the pre-check SELECT ... FOR UPDATE while another checkout holds the same key', async () => {
    const customerId = await createUser('A');
    const orderId = await createOrderRow(customerId, { idempotencyKey: 'locked-key' });

    // A row lock, not a gap lock: the key already HAS an order, so the
    // pre-check locks a real row and a retry waits on it at any isolation
    // level. This is the half of the pre-check that READ COMMITTED leaves
    // intact — a retry arriving while the original is still in flight still
    // waits rather than reading a half-built order. (The gap-lock half, for a
    // key with no row yet, is gone; see the describe block below.) Both
    // transactions run at createOrder's own isolation level.
    const holder = await pool.getConnection();
    const waiter = await pool.getConnection();
    try {
      await holder.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await holder.beginTransaction();
      await holder.query(
        'SELECT id FROM orders WHERE customer_id = ? AND idempotency_key = ? FOR UPDATE',
        [customerId, 'locked-key']
      );

      await waiter.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await waiter.beginTransaction();
      let acquired = false;
      const precheck = waiter
        .query(
          `SELECT id FROM orders
            WHERE customer_id = ? AND idempotency_key = ?
              AND idempotency_key_created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY id DESC LIMIT 1
            FOR UPDATE`,
          [customerId, 'locked-key']
        )
        .then(([rows]) => { acquired = true; return rows; });

      await sleep(400);
      expect(acquired).toBe(false);

      await holder.commit();
      const rows = await precheck;
      expect(acquired).toBe(true);
      expect(rows[0].id).toBe(orderId);
    } finally {
      await holder.rollback().catch(() => {});
      await waiter.rollback().catch(() => {});
      holder.release();
      waiter.release();
    }
  });

  it('hands every concurrent checkout in an area a distinct order number', async () => {
    // generateOrderNumber short-circuits to a fixed "<prefix>TEST" string
    // whenever it detects a test run, so the real INSERT ... ON DUPLICATE KEY
    // UPDATE seq = LAST_INSERT_ID(seq + 1) reservation — the part that has to
    // be collision-free under concurrency, and whose correctness depends on
    // daily_order_counters' (area_id, counter_date) primary key — is normally
    // never executed by any test. Lift the short-circuit for this one.
    const savedNodeEnv = process.env.NODE_ENV;
    const savedWorkerId = process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;

    // Restore rather than delete: a developer whose dev and test databases are
    // the same would otherwise have this test reset their live order-number
    // sequence for today.
    const [before] = await pool.query(
      'SELECT counter_date, seq FROM daily_order_counters WHERE area_id = 1'
    );

    const connections = [];
    try {
      const attempts = 8;
      for (let index = 0; index < attempts; index += 1) {
        connections.push(await pool.getConnection());
      }

      const numbers = await Promise.all(
        connections.map((connection) => generateOrderNumber(connection, 1, 'A1'))
      );

      expect(numbers).toHaveLength(attempts);
      // LAST_INSERT_ID is per-connection, so each of these separate
      // connections must come back with its own sequence value.
      expect(new Set(numbers).size).toBe(attempts);
      expect(numbers.every((number) => /^OD-\d{8}-A1-\d{4}$/.test(number))).toBe(true);
    } finally {
      for (const connection of connections) connection.release();
      process.env.NODE_ENV = savedNodeEnv;
      if (savedWorkerId !== undefined) process.env.JEST_WORKER_ID = savedWorkerId;
      await pool.query('DELETE FROM daily_order_counters WHERE area_id = 1');
      for (const row of before) {
        await pool.query(
          'INSERT INTO daily_order_counters (area_id, counter_date, seq) VALUES (1, ?, ?)',
          [row.counter_date, row.seq]
        );
      }
    }
  });

  // createOrder runs at READ COMMITTED (see the comment on its transaction),
  // which takes no gap locks. These two tests pin what that costs and why it
  // is safe: the pre-check stops blocking duplicate submits, and the unique
  // index plus the ER_DUP_ENTRY replay branch carry them instead.
  describe('duplicate submits once the pre-check gap lock is gone', () => {
    const PRECHECK = `SELECT id FROM orders
        WHERE customer_id = ? AND idempotency_key = ?
          AND idempotency_key_created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY id DESC LIMIT 1
        FOR UPDATE`;

    const openTransaction = async (isolation) => {
      const connection = await pool.getConnection();
      await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
      await connection.beginTransaction();
      return connection;
    };

    it('no longer blocks a simultaneous duplicate at the pre-check, unlike REPEATABLE READ', async () => {
      const customerId = await createUser('A');

      // The key has no row yet, which is the normal case for a first submit.
      // Under REPEATABLE READ the pre-check locks the gap where the row would
      // go and the second request waits there; under READ COMMITTED there is
      // no gap lock and it walks straight through to its INSERT.
      const attempt = async (isolation) => {
        const holder = await openTransaction(isolation);
        const second = await openTransaction(isolation);
        try {
          await shortenLockWait(second);
          await holder.query(PRECHECK, [customerId, `gap-${isolation}`]);
          await second.query(PRECHECK, [customerId, `gap-${isolation}`]);
          await insertWithKey(second, customerId, `gap-${isolation}`);
          return 'through';
        } catch (error) {
          return error.code;
        } finally {
          await holder.rollback().catch(() => {});
          await second.rollback().catch(() => {});
          await restoreSessionSettings(holder);
          await restoreSessionSettings(second);
          holder.release();
          second.release();
        }
      };

      expect(await attempt('REPEATABLE READ')).toBe('ER_LOCK_WAIT_TIMEOUT');
      expect(await attempt('READ COMMITTED')).toBe('through');
    });

    it('still lands one order, via the unique index and the replay re-read', async () => {
      const customerId = await createUser('A');

      const winner = await openTransaction('READ COMMITTED');
      const loser = await openTransaction('READ COMMITTED');
      let loserError = null;
      try {
        // Both get past the pre-check, as the test above establishes.
        await winner.query(PRECHECK, [customerId, 'dup-submit']);
        await loser.query(PRECHECK, [customerId, 'dup-submit']);

        await insertWithKey(winner, customerId, 'dup-submit');

        const loserInsert = insertWithKey(loser, customerId, 'dup-submit')
          .catch((error) => { loserError = error; });

        await sleep(300);
        // The duplicate-key check waits on the winner's index lock rather than
        // failing immediately, which is what makes the replay re-read below
        // safe: by the time ER_DUP_ENTRY arrives, the winner has committed and
        // its row is readable. createOrder treats "duplicate key but no row
        // found" as unreachable, so this ordering is load-bearing.
        expect(loserError).toBeNull();

        await winner.commit();
        await loserInsert;
        expect(loserError).not.toBeNull();
        expect(loserError.code).toBe('ER_DUP_ENTRY');

        // createOrder's replay path: roll back, then re-read through the pool.
        await loser.rollback();
        const [rows] = await pool.query(
          `SELECT id, order_number FROM orders
            WHERE customer_id = ? AND idempotency_key = ?
            ORDER BY id DESC LIMIT 1`,
          [customerId, 'dup-submit']
        );
        expect(rows).toHaveLength(1);

        const [all] = await pool.query(
          'SELECT COUNT(*) AS count FROM orders WHERE customer_id = ? AND idempotency_key = ?',
          [customerId, 'dup-submit']
        );
        expect(Number(all[0].count)).toBe(1);
      } finally {
        await winner.rollback().catch(() => {});
        await loser.rollback().catch(() => {});
        winner.release();
        loser.release();
      }
    });
  });
});

// Top level, so it runs after every describe above rather than after the
// first one. A pool.end() inside any of them would close the pool while the
// later describes still needed it.
afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
