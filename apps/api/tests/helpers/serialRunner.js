// Jest's own test runner, marked serial, for the tests/integration project in
// jest.config.js. Jest runs each runner's files as a separate batch, never at
// the same time as another batch, and a serial runner's batch one file at a
// time in its main process. The unit files keep their parallel workers.
//
// Why: with RUN_DB_TESTS=1 those files share one real database. Their cleanups
// and range UPDATEs run at REPEATABLE READ, which locks the first row past each
// range — often another file's order — and the orders foreign keys gap-lock
// the end of order_items, rider_order_offers and coupon_redemptions. A cleanup
// waiting on another file's order while that file inserts an offer behind the
// cleanup's gap lock is a deadlock (API CI, 2026-10-01). Each test builds the
// concurrency it checks on its own connections, so one file at a time takes
// nothing away from what they prove.
//
// Only these files: many unit files leave async work that imports after their
// environment is torn down, which in the main process turns the exit code red.
const TestRunner = require('jest-runner').default;

class SerialRunner extends TestRunner {
  // A field, not a getter: the base class declares `isSerial` as a field,
  // which would shadow a getter on this prototype.
  isSerial = true;
}

module.exports = SerialRunner;
