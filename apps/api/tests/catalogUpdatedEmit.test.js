/**
 * bustAreaCaches now pushes a debounced `catalog.updated` to the area's
 * customers, so an admin price/product edit reaches phones without waiting
 * for a focus refresh. Bulk writes call bustAreaCaches once per row, so the
 * emit must collapse to one per area per window — that collapsing is the
 * only non-trivial part, and this is the check for it.
 */
jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn().mockResolvedValue([[]]) },
}));

jest.mock('../src/realtime/socket', () => ({ emitToAllCustomers: jest.fn() }));

const { emitToAllCustomers } = require('../src/realtime/socket');
const { bustAreaCaches } = require('../src/utils/areaScope');

describe('catalog.updated emit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    emitToAllCustomers.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('collapses a burst of cache busts into one emit per area', async () => {
    for (let i = 0; i < 200; i += 1) await bustAreaCaches(1);
    expect(emitToAllCustomers).not.toHaveBeenCalled(); // debounced, not immediate

    jest.advanceTimersByTime(5000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(1);
    expect(emitToAllCustomers).toHaveBeenCalledWith(1, 'catalog.updated', { areaId: 1 });
  });

  it('treats a string areaId as the same area (req.params gives strings)', async () => {
    await bustAreaCaches(1);
    await bustAreaCaches('1');
    jest.advanceTimersByTime(5000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(1);
  });

  it('keeps areas independent', async () => {
    await bustAreaCaches(1);
    await bustAreaCaches(2);
    jest.advanceTimersByTime(5000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2);
    expect(emitToAllCustomers).toHaveBeenCalledWith(2, 'catalog.updated', { areaId: 2 });
  });

  it('emits again after the window closes', async () => {
    await bustAreaCaches(1);
    jest.advanceTimersByTime(5000);
    await bustAreaCaches(1);
    jest.advanceTimersByTime(5000);
    expect(emitToAllCustomers).toHaveBeenCalledTimes(2);
  });
});
