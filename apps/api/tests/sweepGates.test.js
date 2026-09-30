/**
 * The idle gates in front of the shop-alert and rider-offer sweepers
 * (realtime/sweepGates.js). While closed a tick sends no query at all; a wake
 * or the SWEEPER_IDLE_CHECK_MS safety check reopens it. What must never
 * happen is a sweeper with live work left asleep, so the race (a wake during
 * the check) and database errors are covered here; the real order flow waking
 * each gate is tests/integration/sweeperIdleGates.test.js.
 */

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() },
}));
jest.mock('../src/utils/shops', () => ({
  remindShopOrderOwner: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/shopOrderActions', () => ({
  rejectShopOrder: jest.fn(),
}));
jest.mock('../src/services/riderAssignment', () => ({
  hasLiveDispatch: jest.fn(),
  expireDueOffers: jest.fn().mockResolvedValue([]),
  remindPendingOffers: jest.fn().mockResolvedValue({ pending: 0 }),
  recoverStuckAssignments: jest.fn().mockResolvedValue([]),
}));

const { pool } = require('../src/db/mysql');
const config = require('../src/config/env');
const gates = require('../src/realtime/sweepGates');
const shopAlertSweeper = require('../src/realtime/shopAlertSweeper');
const riderOfferSweeper = require('../src/realtime/riderOfferSweeper');
const riderAssignment = require('../src/services/riderAssignment');
const logger = require('../src/utils/logger');

const IDLE_MS = config.SWEEPER_IDLE_CHECK_MS;

describe('createGate', () => {
  it('closes for the idle-check interval, then opens again on its own', () => {
    const gate = gates.createGate(60_000);
    expect(gate.isClosed(1_000)).toBe(false);
    gate.close(gate.checkpoint(), 1_000);
    expect(gate.isClosed(1_000)).toBe(true);
    expect(gate.isClosed(60_999)).toBe(true);
    expect(gate.isClosed(61_000)).toBe(false); // the safety re-check
  });

  it('opens at once when woken', () => {
    const gate = gates.createGate(60_000);
    gate.close(gate.checkpoint(), 1_000);
    gate.wake();
    expect(gate.isClosed(1_001)).toBe(false);
  });

  it('stays open when woken while the check was still running', () => {
    const gate = gates.createGate(60_000);
    const checkpoint = gate.checkpoint(); // check starts, sees nothing yet...
    gate.wake(); // ...an order is accepted and committed meanwhile...
    gate.close(checkpoint, 1_000); // ...so "found nothing" is stale
    expect(gate.isClosed(1_001)).toBe(false);
  });
});

describe('shop-alert sweeper tick', () => {
  beforeEach(() => {
    pool.query.mockReset();
    gates.shopAlerts.wake();
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('checks once, finds no shop waiting, and then sends no query until the idle check', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    pool.query.mockResolvedValue([[]]);

    await shopAlertSweeper.tick();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toMatch(/FROM orders o\s+JOIN order_items oi/);

    jest.setSystemTime(1_000_000 + IDLE_MS - 1);
    await shopAlertSweeper.tick();
    expect(pool.query).toHaveBeenCalledTimes(1);

    jest.setSystemTime(1_000_000 + IDLE_MS);
    await shopAlertSweeper.tick();
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('runs both passes, as before, while a shop is waiting', async () => {
    pool.query
      .mockResolvedValueOnce([[{ 1: 1 }]]) // a shop is waiting
      .mockResolvedValueOnce([[]]) // remind pass: nothing due this tick
      .mockResolvedValueOnce([[]]); // timeout pass: nobody past the window

    await shopAlertSweeper.tick();
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[1][0]).toMatch(/shop_last_notified_at/);
    expect(pool.query.mock.calls[2][0]).toMatch(/SELECT DISTINCT oi\.order_id/);
    expect(gates.shopAlerts.isClosed()).toBe(false); // keeps ticking
  });

  it('keeps ticking when the check itself fails (never sleeps on an error)', async () => {
    pool.query.mockRejectedValueOnce(new Error('connection lost'));
    await shopAlertSweeper.tick();
    expect(gates.shopAlerts.isClosed()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('[shop-alert] tick failed:', 'connection lost');
  });
});

describe('rider-offer sweeper tick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    gates.riderDispatch.wake();
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips all three passes and sleeps when nothing is being dispatched', async () => {
    riderAssignment.hasLiveDispatch.mockResolvedValueOnce(false);
    await riderOfferSweeper.tick();
    expect(riderAssignment.expireDueOffers).not.toHaveBeenCalled();
    expect(gates.riderDispatch.isClosed()).toBe(true);

    await riderOfferSweeper.tick();
    expect(riderAssignment.hasLiveDispatch).toHaveBeenCalledTimes(1); // asleep: not even the check
  });

  it('runs expire, remind and recover, in that order, while an offer or search is live', async () => {
    riderAssignment.hasLiveDispatch.mockResolvedValueOnce(true);
    await riderOfferSweeper.tick();
    const order = (fn) => fn.mock.invocationCallOrder[0];
    expect(order(riderAssignment.expireDueOffers)).toBeLessThan(order(riderAssignment.remindPendingOffers));
    expect(order(riderAssignment.remindPendingOffers)).toBeLessThan(order(riderAssignment.recoverStuckAssignments));
    expect(gates.riderDispatch.isClosed()).toBe(false);
  });

  it('keeps ticking when the check itself fails', async () => {
    riderAssignment.hasLiveDispatch.mockRejectedValueOnce(new Error('connection lost'));
    await riderOfferSweeper.tick();
    expect(gates.riderDispatch.isClosed()).toBe(false);
  });
});
