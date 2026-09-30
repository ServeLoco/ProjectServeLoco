/**
 * Periodic sweeper for rider offer timeouts + boot rehydrate.
 * DB is source of truth (expires_at); works across multi-instance APIs.
 *
 * Deliberately NOT area-scoped (H2/15.5): expireDueOffers, remindPendingOffers
 * and recoverStuckAssignments each operate on already-known offer_id/order_id
 * rows pulled straight from the DB, and recoverStuckAssignments' own eligible-
 * rider lookup is scoped per order's area_id (utils/riders.js, TASK 15) — so
 * running this sweep globally across every area in one tick is safe, not a
 * gap. Their admin.* socket emits (riderAssignment.js) key off each order's
 * own area_id into emitToAdmins' per-area room (TASK 23), same as every
 * other realtime emit in the codebase.
 *
 * With no pending offer and no order looking for a rider the passes are
 * skipped entirely: the tick checks hasLiveDispatch first and sleeps behind
 * sweepGates.riderDispatch until a search or offer wakes it (see
 * realtime/sweepGates.js).
 */

const config = require('../config/env');
const logger = require('../utils/logger');
const {
  expireDueOffers,
  recoverStuckAssignments,
  remindPendingOffers,
  hasLiveDispatch,
} = require('../services/riderAssignment');
const { riderDispatch: gate } = require('./sweepGates');

const RIDER_SWEEPER_MS = config.RIDER_SWEEPER_MS || 5000;

let timer = null;
let running = false;

let missingTableLogged = false;

const tick = async () => {
  if (running || gate.isClosed()) return;
  running = true;
  try {
    const checkpoint = gate.checkpoint();
    if (await hasLiveDispatch()) {
      await expireDueOffers();
      // Continuous Expo push while offer is pending (app open or closed).
      await remindPendingOffers();
      await recoverStuckAssignments();
    } else {
      gate.close(checkpoint);
    }
    missingTableLogged = false;
  } catch (e) {
    // Avoid log spam every 5s when migrations have not been applied yet.
    const missing = e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146
      || /doesn't exist/i.test(e.message || ''));
    if (missing) {
      if (!missingTableLogged) {
        logger.error('[rider-sweeper] rider tables missing — run npm run db:migrate:dev once. Further ticks suppressed until fixed.');
        missingTableLogged = true;
      }
    } else {
      logger.error('[rider-sweeper] tick failed:', e.message);
    }
  } finally {
    running = false;
  }
};

const startRiderOfferSweeper = () => {
  if (timer) return;
  gate.wake(); // first tick checks for live work, whatever an earlier run left
  // Immediate rehydrate of anything already expired
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, RIDER_SWEEPER_MS);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info(`[rider-sweeper] started (interval=${RIDER_SWEEPER_MS}ms)`);
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
