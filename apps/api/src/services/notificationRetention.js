/**
 * Customer notifications are kept for NOTIFICATION_RETENTION_DAYS (5) and then
 * deleted for good. A broadcast writes one row per customer and most of them
 * are never opened, so without this the table doubled every month and was
 * ~89% of the whole database (plans/rds-performance-audit.md, issue 5).
 *
 * Only `notifications` rows go. Nothing references notifications.id, and the
 * admin broadcast history (notification_batches) keeps its own
 * recipient_count, so it is unaffected.
 *
 * Runs once shortly after boot (a deploy/restart can skip the nightly run),
 * then nightly at 03:30 IST — after the 03:00 suggestions build.
 */
const config = require('../config/env');
const { pool } = require('../db/mysql');
const { msUntilNextIst } = require('../utils/businessTime');
const logger = require('../utils/logger');

const RUN_HOUR = 3;
const RUN_MINUTE = 30;
const BOOT_DELAY_MS = 90 * 1000;
// Small batches keep each DELETE's row locks and binlog event short, so a
// customer opening or marking a notification never waits behind the purge.
const BATCH_SIZE = 1000;
const BATCH_PAUSE_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Hard-deletes notifications created more than `days` ago.
 * @returns {Promise<number>} rows deleted
 */
const purgeOldNotifications = async ({
  days = config.NOTIFICATION_RETENTION_DAYS,
  batchSize = BATCH_SIZE,
  pauseMs = BATCH_PAUSE_MS,
} = {}) => {
  // A zero or negative value would put the cutoff in the future and delete
  // every notification, so refuse anything that isn't a whole day or more.
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`notification retention must be at least 1 day, got ${days}`);
  }

  // created_at has no index of its own. Find the newest expired id once with
  // a plain (non-locking) read, then delete by primary-key range: a DELETE
  // filtered on created_at alone would scan — and, under REPEATABLE READ,
  // lock — every row in the table on its last batch.
  const [[{ maxId }]] = await pool.query(
    'SELECT MAX(id) AS maxId FROM notifications WHERE created_at < NOW() - INTERVAL ? DAY',
    [days]
  );
  if (!maxId) return 0;

  let deleted = 0;
  for (;;) {
    const [result] = await pool.query(
      `DELETE FROM notifications
        WHERE id <= ? AND created_at < NOW() - INTERVAL ? DAY
        ORDER BY id
        LIMIT ?`,
      [maxId, days, batchSize]
    );
    deleted += result.affectedRows;
    if (result.affectedRows < batchSize) break;
    await sleep(pauseMs);
  }
  return deleted;
};

const runPurge = async (trigger) => {
  const days = config.NOTIFICATION_RETENTION_DAYS;
  try {
    const deleted = await purgeOldNotifications({ days });
    logger.info({ deleted, days, trigger }, '[notification-retention] purge done');
  } catch (error) {
    logger.error({ err: error, trigger }, '[notification-retention] purge failed');
  }
};

let bootTimer = null;
let nightlyTimer = null;

const startNotificationRetentionScheduler = () => {
  bootTimer = setTimeout(() => runPurge('boot'), BOOT_DELAY_MS);
  bootTimer.unref();

  const scheduleNext = () => {
    nightlyTimer = setTimeout(async () => {
      await runPurge('nightly');
      scheduleNext();
    }, msUntilNextIst(RUN_HOUR, RUN_MINUTE));
    nightlyTimer.unref();
  };
  scheduleNext();
};

const stopNotificationRetentionScheduler = () => {
  if (bootTimer) clearTimeout(bootTimer);
  if (nightlyTimer) clearTimeout(nightlyTimer);
  bootTimer = null;
  nightlyTimer = null;
};

module.exports = {
  purgeOldNotifications,
  startNotificationRetentionScheduler,
  stopNotificationRetentionScheduler,
};
