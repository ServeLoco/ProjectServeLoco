// Daily rollup job — aggregates sessions + events for a calendar day into one
// analytics_daily doc (TTL 365d). Runs in-process at 00:05 via setTimeout; on
// startup also backfills yesterday if its doc is missing. No new dependencies.

const { getDb } = require('../../db/mongodb');

const ROLLOUT_HOUR = 0; // 00:xx
const ROLLOUT_MINUTE = 5; // 00:05

// Local-timezone YYYY-MM-DD. toISOString() would shift to UTC and, in
// timezones ahead of UTC (e.g. IST), roll up the wrong calendar day at 00:05.
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Compute + upsert the daily stats doc for a given date string (YYYY-MM-DD).
 * @param {string} dateStr  e.g. '2026-07-08'
 * @param {import('mongodb').Db} [db]  optional injected db (for testing)
 * @returns {Promise<object>} the computed stats object
 */
const computeDailyStats = async (dateStr, db) => {
  const database = db || getDb();
  const sessionsCol = database.collection('analytics_sessions');
  const eventsCol = database.collection('analytics_events');
  const dailyCol = database.collection('analytics_daily');

  // Date range for the given day (server timezone).
  const dayStart = new Date(dateStr + 'T00:00:00');
  const dayEnd = new Date(dateStr + 'T23:59:59.999');

  // --- Sessions ---
  const sessions = await sessionsCol.find({
    connectedAt: { $gte: dayStart, $lte: dayEnd },
  }).toArray();

  const distinctUsers = new Set();
  let totalTimeSec = 0;
  for (const s of sessions) {
    if (s.userId != null) distinctUsers.add(s.userId);
    totalTimeSec += s.durationSec || 0;
  }
  const visitors = distinctUsers.size;
  const sessionCount = sessions.length;
  const avgSessionSec = sessionCount > 0 ? Math.round(totalTimeSec / sessionCount) : 0;

  // --- Events ---
  const events = await eventsCol.find({
    createdAt: { $gte: dayStart, $lte: dayEnd },
  }).toArray();

  let orders = 0, cartAdds = 0, cartRemoves = 0;
  const usersWithCartAdd = new Set();
  const usersWithOrder = new Set();
  const hourlySet = Array.from({ length: 24 }, () => new Set());
  const productCounts = { cart_add: {}, cart_remove: {}, product_view: {} };

  for (const e of events) {
    const hour = new Date(e.createdAt).getHours();
    if (e.userId != null) hourlySet[hour].add(e.userId);

    if (e.type === 'order_placed') { orders++; usersWithOrder.add(e.userId); }
    if (e.type === 'cart_add') { cartAdds++; usersWithCartAdd.add(e.userId); }
    if (e.type === 'cart_remove') { cartRemoves++; }

    if (e.productId != null && productCounts[e.type]) {
      productCounts[e.type][e.productId] = (productCounts[e.type][e.productId] || 0) + 1;
    }
  }

  // Window shoppers: users with cart_add but no order_placed.
  let windowShoppers = 0;
  for (const uid of usersWithCartAdd) {
    if (!usersWithOrder.has(uid)) windowShoppers++;
  }

  const conversionPct = visitors > 0
    ? Math.round((usersWithOrder.size / visitors) * 1000) / 10
    : 0;

  const hourlyActive = hourlySet.map(s => s.size);

  const toTop10 = (counts) =>
    Object.entries(counts)
      .map(([productId, count]) => ({ productId: Number(productId), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

  const stats = {
    date: dateStr,
    visitors,
    sessions: sessionCount,
    newUsers: 0, // computed below if possible
    avgSessionSec,
    orders,
    conversionPct,
    cartAdds,
    cartRemoves,
    windowShoppers,
    hourlyActive,
    topAdded: toTop10(productCounts.cart_add),
    topRemoved: toTop10(productCounts.cart_remove),
    topViewed: toTop10(productCounts.product_view),
  };

  // Upsert into analytics_daily.
  await dailyCol.updateOne(
    { date: dateStr },
    {
      $set: { ...stats, createdAt: new Date() },
      $setOnInsert: { date: dateStr },
    },
    { upsert: true }
  );

  return stats;
};

/**
 * Milliseconds until the next 00:05 local time.
 */
const msUntilNextRun = (now = new Date()) => {
  const next = new Date(now);
  next.setHours(ROLLOUT_HOUR, ROLLOUT_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
};

/**
 * Backfill yesterday if its daily doc is missing (called on startup).
 */
const backfillYesterday = async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = toLocalDateStr(yesterday);
    const db = getDb();
    const existing = await db.collection('analytics_daily').findOne({ date: dateStr });
    if (!existing) {
      await computeDailyStats(dateStr, db);
      console.log(`[analytics-rollup] backfilled yesterday (${dateStr})`);
    }
  } catch (error) {
    console.error('[analytics-rollup] backfillYesterday failed:', error.message);
  }
};

let rollupTimer = null;

/**
 * Schedule the daily rollup at 00:05 in-process (no node-cron). On startup,
 * also backfill yesterday. The timer is unref()'d so it doesn't keep the
 * process alive on graceful shutdown.
 */
const startRollupScheduler = () => {
  // Backfill yesterday on startup (fire-and-forget).
  backfillYesterday().catch(() => {});

  const scheduleNext = () => {
    const ms = msUntilNextRun();
    rollupTimer = setTimeout(async () => {
      try {
        // Roll up yesterday (the day that just ended).
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = toLocalDateStr(yesterday);
        await computeDailyStats(dateStr);
        console.log(`[analytics-rollup] computed daily stats for ${dateStr}`);
      } catch (error) {
        console.error('[analytics-rollup] scheduled run failed:', error.message);
      }
      scheduleNext();
    }, ms);
    rollupTimer.unref();
  };
  scheduleNext();
};

const stopRollupScheduler = () => {
  if (rollupTimer) {
    clearTimeout(rollupTimer);
    rollupTimer = null;
  }
};

module.exports = { computeDailyStats, startRollupScheduler, stopRollupScheduler, msUntilNextRun };
