// Harness for the integration tests that run against a REAL MySQL instead of
// the mocked `src/db/mysql` every other test file uses.
//
// Why these exist at all: the order path's three concurrency guarantees —
// the coupon `SELECT ... FOR UPDATE` lock, the compare-and-set 409s on order
// status/payment, and the unique `idx_orders_idempotency` index — are all
// properties of the DATABASE, not of our JavaScript. A mocked pool returns
// whatever the test tells it to, so it can confirm the code calls the right
// query but never that MySQL actually serializes, actually reports
// affectedRows = 0, or actually rejects the duplicate key. Those need a
// server.
//
// Gating: CI sets RUN_DB_TESTS=1 (its mysql service container is already up
// for the migration step), so a broken DB there is a loud failure, not a
// silent skip. Locally the suite skips unless a developer opts in, so
// `npm test` still needs no MySQL.
const { pool } = require('../../src/db/mysql');

const DB_TESTS_ENABLED = process.env.RUN_DB_TESTS === '1';

// describeWithMysql — a `describe` that skips wholesale when the opt-in flag
// is absent. Deliberately NOT "skip when the connection fails": in CI a dead
// database must fail the build.
const describeWithMysql = DB_TESTS_ENABLED ? describe : describe.skip;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asserts the server is actually reachable and carries a migrated schema.
// Called from beforeAll so the failure names the cause instead of surfacing
// as a dozen confusing query errors.
const assertMysqlReady = async () => {
  await pool.query('SELECT 1');
  const [rows] = await pool.query(
    `SELECT NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
       AND INDEX_NAME = 'idx_orders_idempotency' LIMIT 1`
  );
  if (rows.length === 0) {
    throw new Error(
      'orders.idx_orders_idempotency is missing — run `npm run db:migrate` against the test database first.'
    );
  }
};

// Every fixture row a test file creates is tagged with this marker, and
// cleanup deletes by it, so a suite never touches rows a developer already had
// in their local test database.
//
// The tag is generated per module instance — meaning per test FILE, since jest
// gives each file its own module registry — because jest runs files in
// parallel workers against one database. A shared tag would have each file's
// cleanup deleting the fixtures a sibling file was still using. The cost is
// that a hard crash mid-run leaves its rows behind; CI starts from a fresh
// container, and locally they are inert rows in a test database.
const FIXTURE_TAG = `ITC${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

let seq = 0;
const uniqueSuffix = () => `${(seq += 1)}`;
// Digits only, unique per module instance, inside users.phone's VARCHAR(20).
const PHONE_PREFIX = `7${String(process.pid).slice(-5)}${Math.floor(Math.random() * 90000) + 10000}`;

const createUser = async (name = 'Concurrency User') => {
  // phone is UNIQUE.
  const phone = `${PHONE_PREFIX}${uniqueSuffix()}`;
  const [result] = await pool.query(
    'INSERT INTO users (name, phone, address, last_area_id) VALUES (?, ?, ?, 1)',
    [`${FIXTURE_TAG} ${name}`, phone, '1 Test Street']
  );
  return result.insertId;
};

// A coupon that passes every eligibility rule in utils/coupons.js except the
// usage limits the caller sets, so a failing validation in these tests can
// only mean a usage/locking outcome.
const createCoupon = async ({ totalUsageLimit = null, perUserUsageLimit = null } = {}) => {
  const code = `${FIXTURE_TAG}${uniqueSuffix()}`.toUpperCase().slice(0, 40);
  const [result] = await pool.query(
    `INSERT INTO coupons
       (code, title, discount_type, discount_value, min_order_amount,
        total_usage_limit, per_user_usage_limit, target_audience, target_zones,
        auto_apply, requires_code, active, deleted, area_id)
     VALUES (?, ?, 'flat', 25, 0, ?, ?, 'all', 'all', 0, 1, 1, 0, 1)`,
    [code, `${FIXTURE_TAG} coupon`, totalUsageLimit, perUserUsageLimit]
  );
  return { id: result.insertId, code };
};

const createOrderRow = async (customerId, overrides = {}) => {
  const {
    status = 'Pending',
    paymentStatus = 'Pending',
    paymentMethod = 'Cash',
    couponId = null,
    idempotencyKey = null,
    areaId = 1,
  } = overrides;
  const [result] = await pool.query(
    `INSERT INTO orders
       (order_number, customer_id, customer_name, phone, address,
        subtotal, delivery_charge, total, status, payment_status, payment_method,
        coupon_id, idempotency_key, idempotency_key_created_at, area_id)
     VALUES (?, ?, ?, '7000000000', '1 Test Street', 100, 0, 100, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${FIXTURE_TAG}-${uniqueSuffix()}`,
      customerId,
      `${FIXTURE_TAG} Customer`,
      status,
      paymentStatus,
      paymentMethod,
      couponId,
      idempotencyKey,
      idempotencyKey ? new Date() : null,
      areaId,
    ]
  );
  return result.insertId;
};

const addRedemption = async (couponId, userId, orderId, status = 'active') => {
  const [result] = await pool.query(
    'INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount, status) VALUES (?, ?, ?, 25, ?)',
    [couponId, userId, orderId, status]
  );
  return result.insertId;
};

// Order matters — coupon_redemptions and orders carry FKs to users/coupons.
const cleanupFixtures = async () => {
  await pool.query(
    `DELETE cr FROM coupon_redemptions cr
       JOIN coupons c ON c.id = cr.coupon_id
      WHERE c.code LIKE ?`,
    [`${FIXTURE_TAG}%`]
  );
  await pool.query('DELETE FROM orders WHERE order_number LIKE ?', [`${FIXTURE_TAG}-%`]);
  await pool.query('DELETE FROM coupons WHERE code LIKE ?', [`${FIXTURE_TAG}%`]);
  await pool.query('DELETE FROM users WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
};

// Runs `fn` on its own pooled connection inside a transaction, and always
// rolls back + releases — a test that throws mid-transaction must not leave a
// row lock held for the rest of the file.
const withRolledBackTransaction = async (fn) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    return await fn(connection);
  } finally {
    try {
      await connection.rollback();
    } catch {
      // connection already unusable — nothing to roll back
    }
    connection.release();
  }
};

module.exports = {
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
  withRolledBackTransaction,
};
