/**
 * bustAreaCaches pushes `catalog.updated` to the area's customers, so an
 * admin price/product edit reaches phones without waiting for a focus
 * refresh. The first write after a quiet spell goes out immediately (a single
 * price edit must show on phones at once); bulk writes call bustAreaCaches
 * once per row, so the rest of a burst collapses into ONE trailing emit —
 * that collapsing is the only non-trivial part, and this is the check for it.
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn().mockResolvedValue([[]]) },
}));

jest.mock('../src/realtime/socket', () => ({
  emitToAllCustomers: jest.fn(),
  customerRefetchPushedSince: jest.fn(() => false),
}));

const { emitToAllCustomers, customerRefetchPushedSince } = require('../src/realtime/socket');
const { bustAreaCaches } = require('../src/utils/areaScope');

describe('catalog.updated emit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    emitToAllCustomers.mockClear();
    customerRefetchPushedSince.mockReset().mockReturnValue(false);
  });
  afterEach(() => {
    // Let any pending per-area timer fire so its Map entry doesn't leak into
    // the next test (the module keeps state between tests).
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('emits at once for a single edit, and only once', async () => {
    await bustAreaCaches(1);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(1); // no waiting
    expect(emitToAllCustomers).toHaveBeenCalledWith(1, 'catalog.updated', { areaId: 1 });

    jest.advanceTimersByTime(5000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(1); // nothing else follows
  });

  it('collapses a burst of cache busts into a leading and one trailing emit', async () => {
    for (let i = 0; i < 200; i += 1) await bustAreaCaches(1);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(1); // the leading one

    jest.advanceTimersByTime(1000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2); // + one trailing
  });

  it('waits for a slow bulk write to finish instead of firing mid-import', async () => {
    // 500-row import, a row every 500ms: after the leading emit nothing goes
    // out while rows are still landing.
    for (let i = 0; i < 10; i += 1) {
      await bustAreaCaches(1);
      jest.advanceTimersByTime(500);
    }
    expect(emitToAllCustomers).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2);
  });

  it('caps the wait so a steady drip of edits cannot starve it', async () => {
    // Same drip, but past the 30s cap — the trailing emit stops being deferred.
    for (let i = 0; i < 70; i += 1) {
      await bustAreaCaches(1);
      jest.advanceTimersByTime(500);
    }
    expect(emitToAllCustomers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('treats a string areaId as the same area (req.params gives strings)', async () => {
    await bustAreaCaches(1);
    await bustAreaCaches('1');
    jest.advanceTimersByTime(1000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2); // leading + trailing, not two timers
  });

  it('keeps areas independent', async () => {
    await bustAreaCaches(1);
    await bustAreaCaches(2);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2);
    expect(emitToAllCustomers).toHaveBeenCalledWith(2, 'catalog.updated', { areaId: 2 });
  });

  it('stays quiet when the caller already pushed a refetch event', async () => {
    // A scheduled shop open emits shop.status.updated and then busts the
    // caches — one change must not cost every phone two refetches.
    customerRefetchPushedSince.mockReturnValue(true);
    await bustAreaCaches(1);
    jest.advanceTimersByTime(5000);
    expect(emitToAllCustomers).not.toHaveBeenCalled();
  });

  it('emits again for the next edit once the burst has settled', async () => {
    await bustAreaCaches(1);
    jest.advanceTimersByTime(2000);
    await bustAreaCaches(1);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2);
  });
});
