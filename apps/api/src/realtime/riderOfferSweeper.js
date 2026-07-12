/**
 * Periodic sweeper for rider offer timeouts + boot rehydrate.
 * DB is source of truth (expires_at); works across multi-instance APIs.
 */

const config = require('../config/env');
const { expireDueOffers, recoverStuckAssignments } = require('../services/riderAssignment');

const RIDER_SWEEPER_MS = config.RIDER_SWEEPER_MS || 5000;

let timer = null;
let running = false;

let missingTableLogged = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    await expireDueOffers();
    await recoverStuckAssignments();
    missingTableLogged = false;
  } catch (e) {
    // Avoid log spam every 5s when migrations have not been applied yet.
    const missing = e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146
      || /doesn't exist/i.test(e.message || ''));
    if (missing) {
      if (!missingTableLogged) {
        console.error('[rider-sweeper] rider tables missing — run npm run db:migrate:dev once. Further ticks suppressed until fixed.');
        missingTableLogged = true;
      }
    } else {
      console.error('[rider-sweeper] tick failed:', e.message);
    }
  } finally {
    running = false;
  }
};

const startRiderOfferSweeper = () => {
  if (timer) return;
  // Immediate rehydrate of anything already expired
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, RIDER_SWEEPER_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[rider-sweeper] started (interval=${RIDER_SWEEPER_MS}ms)`);
};

const stopRiderOfferSweeper = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = {
  startRiderOfferSweeper,
  stopRiderOfferSweeper,
  tick,
  RIDER_SWEEPER_MS,
};
