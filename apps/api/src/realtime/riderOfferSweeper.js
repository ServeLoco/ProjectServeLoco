/**
 * Periodic sweeper for rider offer timeouts + boot rehydrate.
 * DB is source of truth (expires_at); works across multi-instance APIs.
 */

const { expireDueOffers } = require('../services/riderAssignment');

const RIDER_SWEEPER_MS = Number(process.env.RIDER_SWEEPER_MS) || 5000;

let timer = null;
let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    await expireDueOffers();
  } catch (e) {
    console.error('[rider-sweeper] tick failed:', e.message);
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
