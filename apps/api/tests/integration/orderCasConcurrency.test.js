// Compare-and-set 409s on order status and payment, driven through the real
// admin HTTP routes against a REAL MySQL.
//
// The controller decides "someone else changed this order" from
// `affectedRows === 0` on an UPDATE carrying `AND status = <what we read>`.
// That is MySQL's answer, not ours: a mocked pool returns whatever
// affectedRows the test hands it, so it can never show that two genuinely
// concurrent requests produce exactly one winner — nor catch the inverse
// trap the controller documents, where MySQL also reports affectedRows = 0
// for a same-value UPDATE and a naive reading would 409 a no-op.
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
  describeWithMysql,
  assertMysqlReady,
  pool,
  sleep,
  createUser,
  createCoupon,
  createOrderRow,
  addRedemption,
  cleanupFixtures,
} = require('../helpers/realMysql');

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

describeWithMysql('order compare-and-set concurrency (real MySQL)', () => {
  beforeAll(async () => {
    await assertMysqlReady();
    await cleanupFixtures();
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await pool.end();
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
