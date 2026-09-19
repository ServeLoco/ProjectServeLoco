// The orders idempotency index under concurrency, against a REAL MySQL.
//
// createOrder's duplicate-submit protection is two halves that only a real
// server puts together: a `SELECT ... FOR UPDATE` pre-check inside the
// transaction, and — for the requests that get past it simultaneously — the
// unique index `idx_orders_idempotency (customer_id, idempotency_key)`
// rejecting the second INSERT, which the controller catches and turns into
// the same replay response. A mocked pool has no unique index and invents
// whatever error the test asks for, so it cannot show that the index exists,
// that it is UNIQUE, that it still tolerates the NULL keys most orders carry,
// or that the error the controller matches on is the error MySQL actually
// raises.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.
const {
  describeWithMysql,
  assertMysqlReady,
  pool,
  sleep,
  FIXTURE_TAG,
  createUser,
  createOrderRow,
  cleanupFixtures,
} = require('../helpers/realMysql');

const { generateOrderNumber } = require('../../src/controllers/orderController');

let orderSeq = 0;
const insertWithKey = (connectionOrPool, customerId, idempotencyKey) => connectionOrPool.query(
  `INSERT INTO orders
     (order_number, customer_id, customer_name, phone, address,
      subtotal, delivery_charge, total, idempotency_key, idempotency_key_created_at, area_id)
   VALUES (?, ?, ?, '7000000000', '1 Test Street', 100, 0, 100, ?, NOW(), 1)`,
  [`${FIXTURE_TAG}-${process.pid}-${(orderSeq += 1)}`, customerId, `${FIXTURE_TAG} Customer`, idempotencyKey]
);

describeWithMysql('order idempotency index concurrency (real MySQL)', () => {
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

    // createOrder's first statement locks the matching order row, so a retry
    // arriving while the original is still in flight waits for it instead of
    // reading a half-built order. Reproduce that: hold the row, then run the
    // same pre-check from a second transaction.
    const holder = await pool.getConnection();
    const waiter = await pool.getConnection();
    try {
      await holder.beginTransaction();
      await holder.query(
        'SELECT id FROM orders WHERE customer_id = ? AND idempotency_key = ? FOR UPDATE',
        [customerId, 'locked-key']
      );

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
});
