jest.mock('../src/db/mysql', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/realtime/orderEvents', () => ({
  emitOrderAutoAccepted: jest.fn(),
  emitNotificationCreated: jest.fn(),
}));
jest.mock('../src/utils/notificationService', () => ({ createOrderNotification: jest.fn() }));
jest.mock('../src/utils/shops', () => ({ notifyShopsForOrder: jest.fn() }));

const orderAutoAccept = require('../src/realtime/orderAutoAccept');

// Long enough that the real setTimeout never fires during this test file's
// run — lets us assert the deadline math without fake timers or clearAll()
// (which flips a permanent module-level shutdown flag).
const LONG_DELAY = 3_600_000;

describe('orderAutoAccept deadline math', () => {
  it('extend() pushes the deadline back by exactly the requested amount', () => {
    orderAutoAccept.schedule(101, 'OD-101', LONG_DELAY);
    const before = orderAutoAccept.getDeadline(101);
    const after = orderAutoAccept.extend(101, 30_000);
    expect(after).toBe(before + 30_000);
    expect(orderAutoAccept.getDeadline(101)).toBe(after);
    orderAutoAccept.cancel(101);
  });

  it('extend() can be called multiple times, accumulating', () => {
    orderAutoAccept.schedule(102, 'OD-102', LONG_DELAY);
    const start = orderAutoAccept.getDeadline(102);
    orderAutoAccept.extend(102, 30_000);
    const final = orderAutoAccept.extend(102, 30_000);
    expect(final).toBe(start + 60_000);
    orderAutoAccept.cancel(102);
  });

  it('extend() returns null and leaves no deadline for an order with no active timer', () => {
    expect(orderAutoAccept.extend(9999, 30_000)).toBeNull();
    expect(orderAutoAccept.getDeadline(9999)).toBeNull();
  });

  it('cancel() clears both the timer and the deadline, making extend() a no-op after', () => {
    orderAutoAccept.schedule(103, 'OD-103', LONG_DELAY);
    expect(orderAutoAccept.getDeadline(103)).not.toBeNull();
    orderAutoAccept.cancel(103);
    expect(orderAutoAccept.getDeadline(103)).toBeNull();
    expect(orderAutoAccept.extend(103, 30_000)).toBeNull();
  });

  it('schedule() twice for the same order replaces the previous timer/deadline', () => {
    orderAutoAccept.schedule(104, 'OD-104', LONG_DELAY);
    const first = orderAutoAccept.getDeadline(104);
    orderAutoAccept.schedule(104, 'OD-104', LONG_DELAY * 2);
    const second = orderAutoAccept.getDeadline(104);
    expect(second).toBeGreaterThan(first);
    orderAutoAccept.cancel(104);
  });
});
