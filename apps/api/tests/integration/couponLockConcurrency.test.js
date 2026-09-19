// Coupon redemption under concurrency, against a REAL MySQL.
//
// src/controllers/orderController.js takes `SELECT id FROM coupons WHERE
// id = ? FOR UPDATE` and then re-checks the usage limits
// (recheckUsageUnderLock) so that "two concurrent checkouts can't both
// consume a one-time coupon". Whether that holds is entirely a property of
// InnoDB locking and isolation — a mocked pool proves nothing about it.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.
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

const { validateCoupon } = require('../../src/utils/coupons');
const { recheckUsageUnderLock } = require('../../src/controllers/orderController');

// How long to let a blocked transaction sit before concluding it really is
// blocked. Long enough that a merely-slow query isn't mistaken for a lock
// wait, short enough not to pad the suite.
const LOCK_OBSERVE_MS = 400;

describeWithMysql('coupon redemption concurrency (real MySQL)', () => {
  let connections = [];

  const openTransaction = async () => {
    const connection = await pool.getConnection();
    connections.push(connection);
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
      connection.release();
    }
    connections = [];
    await cleanupFixtures();
  });

  afterAll(async () => {
    await pool.end();
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
    await connB.query('SET SESSION innodb_lock_wait_timeout = 2');
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

  // KNOWN DEFECT — the assertions below state the CORRECT behaviour, and
  // `.failing` records that the code does not yet meet them: jest passes this
  // test while the bug exists and fails it the moment the bug is fixed, at
  // which point drop the `.failing`. It is written this way so the suite
  // never asserts the buggy outcome as if it were intended.
  //
  // createOrder's transaction reads (users, settings, pricing, then
  // validateCoupon's redemption COUNTs) all happen BEFORE the coupon row is
  // locked. Under InnoDB's default REPEATABLE READ those reads establish the
  // transaction's snapshot, and `recheckUsageUnderLock`'s plain SELECT
  // COUNT(*) is served from that same snapshot. So the checkout that WAITED
  // on the FOR UPDATE lock cannot see the redemption the winner committed
  // while it waited: the lock serializes the two checkouts but the recheck
  // reads stale data, and both consume a total_usage_limit = 1 coupon.
  //
  // Reproduced on MariaDB 10.11 and expected to reproduce identically on
  // MySQL 8.0 (same REPEATABLE READ snapshot semantics).
  //
  // A locking read in recheckUsageUnderLock does return fresh data, but takes
  // gap locks on coupon_redemptions that block inserts for UNRELATED coupons
  // — measured, so it is not the fix. Running createOrder's transaction at
  // READ COMMITTED is (each statement gets a fresh view, and no read in
  // createOrder needs to be repeatable), but that is an isolation-level change
  // on the live checkout path and belongs in its own reviewed commit.
  it.failing('rejects the second of two truly concurrent checkouts on a one-use coupon', async () => {
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
});
