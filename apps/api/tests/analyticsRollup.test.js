const { computeDailyStats } = require('../src/services/analytics/rollup');

// Helper to build a fake db whose collections return predetermined data.
// The rollup queries sessions (find+toArray, countDocuments), events
// (aggregate+toArray, find+toArray), and upserts into analytics_daily.
const makeDb = (sessions, events, existingDaily) => {
  const updates = { daily: null };
  const sessionsCol = {
    find: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(sessions),
    }),
    countDocuments: jest.fn().mockResolvedValue(sessions.length),
  };
  const eventsCol = {
    aggregate: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(events),
    }),
    find: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue(events),
    }),
  };
  const dailyCol = {
    findOne: jest.fn().mockResolvedValue(existingDaily || null),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
  };
  const db = {
    collection: jest.fn((name) => {
      if (name === 'analytics_sessions') return sessionsCol;
      if (name === 'analytics_events') return eventsCol;
      if (name === 'analytics_daily') { return { ...dailyCol, __updates: updates }; }
      return {};
    }),
  };
  // Stash the dailyCol so the test can inspect updateOne calls.
  db._dailyCol = dailyCol;
  db._sessionsCol = sessionsCol;
  db._eventsCol = eventsCol;
  return db;
};

describe('computeDailyStats', () => {
  it('computes visitors as distinct userIds from sessions', async () => {
    const sessions = [
      { userId: 1, connectedAt: new Date('2026-07-08T10:00:00Z'), durationSec: 300, platform: 'android' },
      { userId: 2, connectedAt: new Date('2026-07-08T11:00:00Z'), durationSec: 600, platform: 'ios' },
      { userId: 1, connectedAt: new Date('2026-07-08T14:00:00Z'), durationSec: 120, platform: 'android' },
    ];
    const events = [];
    const db = makeDb(sessions, events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.visitors).toBe(2); // distinct userIds: 1 and 2
    expect(result.sessions).toBe(3);
  });

  it('computes avgSessionSec from session durations', async () => {
    const sessions = [
      { userId: 1, durationSec: 300, platform: 'android', connectedAt: new Date('2026-07-08T10:00:00Z') },
      { userId: 2, durationSec: 600, platform: 'ios', connectedAt: new Date('2026-07-08T11:00:00Z') },
    ];
    const db = makeDb(sessions, []);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.avgSessionSec).toBe(450); // (300 + 600) / 2
  });

  it('counts orders from order_placed events', async () => {
    const events = [
      { type: 'order_placed', orderId: 991, userId: 1, createdAt: new Date('2026-07-08T10:00:00Z') },
      { type: 'order_placed', orderId: 992, userId: 2, createdAt: new Date('2026-07-08T11:00:00Z') },
      { type: 'cart_add', productId: 1, userId: 1, createdAt: new Date('2026-07-08T09:00:00Z') },
    ];
    const db = makeDb([], events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.orders).toBe(2);
  });

  it('computes conversionPct as order-placing visitors / visitors', async () => {
    const sessions = [
      { userId: 1, durationSec: 300, platform: 'android', connectedAt: new Date('2026-07-08T10:00:00Z') },
      { userId: 2, durationSec: 300, platform: 'ios', connectedAt: new Date('2026-07-08T11:00:00Z') },
      { userId: 3, durationSec: 300, platform: 'android', connectedAt: new Date('2026-07-08T12:00:00Z') },
    ];
    // Only userId 1 and 2 placed orders → 2/3 = 66.7%
    const events = [
      { type: 'order_placed', userId: 1, createdAt: new Date('2026-07-08T10:00:00Z') },
      { type: 'order_placed', userId: 2, createdAt: new Date('2026-07-08T11:00:00Z') },
      { type: 'cart_add', userId: 3, productId: 1, createdAt: new Date('2026-07-08T12:00:00Z') },
    ];
    const db = makeDb(sessions, events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.visitors).toBe(3);
    expect(result.orders).toBe(2);
    expect(result.conversionPct).toBeCloseTo(66.7, 1);
  });

  it('counts cartAdds and cartRemoves from events', async () => {
    const events = [
      { type: 'cart_add', productId: 1, userId: 1, createdAt: new Date('2026-07-08T10:00:00Z') },
      { type: 'cart_add', productId: 2, userId: 1, createdAt: new Date('2026-07-08T10:01:00Z') },
      { type: 'cart_remove', productId: 1, userId: 1, createdAt: new Date('2026-07-08T10:02:00Z') },
    ];
    const db = makeDb([], events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.cartAdds).toBe(2);
    expect(result.cartRemoves).toBe(1);
  });

  it('counts windowShoppers (cart_add but no order_placed)', async () => {
    const sessions = [
      { userId: 1, durationSec: 300, platform: 'android', connectedAt: new Date('2026-07-08T10:00:00Z') },
      { userId: 2, durationSec: 300, platform: 'ios', connectedAt: new Date('2026-07-08T11:00:00Z') },
      { userId: 3, durationSec: 300, platform: 'android', connectedAt: new Date('2026-07-08T12:00:00Z') },
    ];
    // userId 1: cart_add + order_placed → NOT a window shopper
    // userId 2: cart_add only → window shopper
    // userId 3: no cart_add → not a window shopper
    const events = [
      { type: 'cart_add', userId: 1, productId: 1, createdAt: new Date('2026-07-08T10:00:00Z') },
      { type: 'order_placed', userId: 1, orderId: 991, createdAt: new Date('2026-07-08T10:05:00Z') },
      { type: 'cart_add', userId: 2, productId: 2, createdAt: new Date('2026-07-08T11:00:00Z') },
    ];
    const db = makeDb(sessions, events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.windowShoppers).toBe(1);
  });

  it('computes hourlyActive as distinct users per hour', async () => {
    const events = [
      { type: 'cart_add', userId: 1, createdAt: new Date('2026-07-08T10:00:00Z') }, // hour 10
      { type: 'cart_add', userId: 2, createdAt: new Date('2026-07-08T10:10:00Z') },
      { type: 'product_view', userId: 1, createdAt: new Date('2026-07-08T14:00:00Z') }, // hour 14
    ];
    const db = makeDb([], events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.hourlyActive).toHaveLength(24);
    // Use getHours() to match the implementation's local-timezone hour bucketing.
    const h1 = new Date('2026-07-08T10:00:00Z').getHours();
    const h2 = new Date('2026-07-08T14:00:00Z').getHours();
    expect(result.hourlyActive[h1]).toBe(2); // users 1 and 2
    expect(result.hourlyActive[h2]).toBe(1); // user 1
  });

  it('aggregates topAdded / topRemoved / topViewed (top 10)', async () => {
    const events = [
      { type: 'cart_add', productId: 1, userId: 1, createdAt: new Date('2026-07-08T10:00:00Z') },
      { type: 'cart_add', productId: 1, userId: 2, createdAt: new Date('2026-07-08T10:01:00Z') },
      { type: 'cart_add', productId: 2, userId: 1, createdAt: new Date('2026-07-08T10:02:00Z') },
      { type: 'cart_remove', productId: 1, userId: 1, createdAt: new Date('2026-07-08T10:03:00Z') },
      { type: 'product_view', productId: 3, userId: 1, createdAt: new Date('2026-07-08T10:04:00Z') },
      { type: 'product_view', productId: 3, userId: 2, createdAt: new Date('2026-07-08T10:05:00Z') },
    ];
    const db = makeDb([], events);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.topAdded[0]).toMatchObject({ productId: 1, count: 2 });
    expect(result.topAdded[1]).toMatchObject({ productId: 2, count: 1 });
    expect(result.topRemoved[0]).toMatchObject({ productId: 1, count: 1 });
    expect(result.topViewed[0]).toMatchObject({ productId: 3, count: 2 });
  });

  it('upserts the daily doc with date + createdAt', async () => {
    const db = makeDb([], []);
    await computeDailyStats('2026-07-08', db);
    expect(db._dailyCol.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = db._dailyCol.updateOne.mock.calls[0];
    expect(filter).toEqual({ date: '2026-07-08' });
    expect(update.$set.date).toBe('2026-07-08');
    expect(update.$set.createdAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert).toBeDefined();
  });

  it('handles empty day gracefully (all zeros)', async () => {
    const db = makeDb([], []);
    const result = await computeDailyStats('2026-07-08', db);
    expect(result.visitors).toBe(0);
    expect(result.sessions).toBe(0);
    expect(result.orders).toBe(0);
    expect(result.conversionPct).toBe(0);
    expect(result.cartAdds).toBe(0);
    expect(result.windowShoppers).toBe(0);
    expect(result.hourlyActive).toHaveLength(24);
    expect(result.hourlyActive.every(v => v === 0)).toBe(true);
  });
});
