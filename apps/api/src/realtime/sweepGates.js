/**
 * Lets the two order-flow sweepers (shopAlertSweeper, riderOfferSweeper) skip
 * the database while nothing is live for them.
 *
 * They were ~95% of all database statements — every 2 s and 5 s, all night,
 * almost always finding nothing. Each sweeper still ticks on its own interval
 * (an in-process timer, no query). When its "anything live?" check finds
 * nothing, its gate closes and ticks return at once, until either
 *   - the code that creates its work wakes it — an order accepted, a shop
 *     resend, a rider search or offer — so the very next tick runs, exactly
 *     when it would have run before, or
 *   - SWEEPER_IDLE_CHECK_MS passes and the check runs again, a safety net for
 *     any write that doesn't wake it (a manual database fix, a new code path).
 *
 * Wake only AFTER the write that created the work has committed: a check that
 * ran before the commit would see nothing and close the gate again. A wake
 * that lands while a check is still running keeps the gate open (the counter
 * below), so that race cannot put a sweeper with live work to sleep.
 *
 * Process-local, like the sweepers' own timers. Several API instances would
 * each run their own sweepers and gates; the instance that creates the work
 * wakes its own, and the sweepers are already safe to run side by side.
 */

const config = require('../config/env');

const createGate = (idleCheckMs) => {
  let closedUntil = 0;
  let wakes = 0;
  return {
    /** True while the last check found nothing and nothing has woken it since. */
    isClosed: (now = Date.now()) => now < closedUntil,
    /** Taken just before the "anything live?" check; hand it back to close(). */
    checkpoint: () => wakes,
    /** The check found nothing: skip ticks for a while, unless woken meanwhile. */
    close: (checkpoint, now = Date.now()) => {
      if (checkpoint === wakes) closedUntil = now + idleCheckMs;
    },
    wake: () => {
      wakes += 1;
      closedUntil = 0;
    },
  };
};

module.exports = {
  shopAlerts: createGate(config.SWEEPER_IDLE_CHECK_MS),
  riderDispatch: createGate(config.SWEEPER_IDLE_CHECK_MS),
  createGate,
};
