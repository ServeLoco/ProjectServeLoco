// Nightly build of cart "Add more" suggestions.
//
// Per active area: read delivered orders from the last WINDOW_DAYS, count
// which products (and categories) were bought together, score the pairs
// (scorePairs.js) and replace that area's rows in product_pairs /
// category_pairs. The grouping runs inside MySQL, so the API process only
// sorts the already-grouped rows. Readers (controllers/suggestionController.js)
// never compute anything — they read these tables.
//
// Runs in-process at 03:00 IST (same pattern as services/analytics/rollup.js),
// and once shortly after boot when the last build is older than a day.

const { pool } = require('../../db/mysql');
const { listAreas } = require('../../utils/areaScope');
const { msUntilNextIst } = require('../../utils/businessTime');
const logger = require('../../utils/logger');
const { scorePairs, borrowFromSimilar, MIN_CO_COUNT } = require('./scorePairs');

const WINDOW_DAYS = 180;
// Recency weight = e^(-age/DECAY_DAYS): today 1.0, 60 days ago ~0.37.
const DECAY_DAYS = 60;
const RUN_HOUR = 3;
const RUN_MINUTE = 0;
const BOOT_DELAY_MS = 60 * 1000;
const STALE_AFTER_HOURS = 26;
const INSERT_BATCH = 500;

const RECENCY_WEIGHT = `EXP(-TIMESTAMPDIFF(DAY, o.created_at, NOW()) / ${DECAY_DAYS})`;
const DELIVERED_IN_WINDOW = `
  o.area_id = ?
  AND o.status = 'Delivered'
  AND o.created_at >= NOW() - INTERVAL ${WINDOW_DAYS} DAY`;

// One row per (order, item) — the same product twice in one order (two
// variants) is still one "bought together" signal, not two.
const orderItemsSql = (itemColumn, extraJoin = '') => `
  SELECT DISTINCT oi.order_id, ${itemColumn} AS item_id, ${RECENCY_WEIGHT} AS w
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  ${extraJoin}
  WHERE ${DELIVERED_IN_WINDOW}
    AND oi.item_type = 'product'`;

const PRODUCT_ITEMS = orderItemsSql('oi.product_id');
const CATEGORY_ITEMS = orderItemsSql('p.category_id', 'JOIN products p ON p.id = oi.product_id');

const toNumber = (value) => Number(value) || 0;

const loadTotals = async (areaId) => {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(${RECENCY_WEIGHT}), 0) AS weight FROM orders o WHERE ${DELIVERED_IN_WINDOW}`,
    [areaId]
  );
  return toNumber(rows[0] && rows[0].weight);
};

const loadItemWeights = async (itemsSql, areaId) => {
  const [rows] = await pool.query(
    `SELECT t.item_id, SUM(t.w) AS weight FROM (${itemsSql}) t GROUP BY t.item_id`,
    [areaId]
  );
  return new Map(rows.map((row) => [toNumber(row.item_id), toNumber(row.weight)]));
};

const loadPairRows = async (itemsSql, areaId) => {
  const [rows] = await pool.query(
    `SELECT a.item_id AS productId, b.item_id AS pairedId,
            COUNT(*) AS coCount, SUM(a.w) AS weighted
     FROM (${itemsSql}) a
     JOIN (${itemsSql}) b ON b.order_id = a.order_id AND b.item_id <> a.item_id
     GROUP BY a.item_id, b.item_id
     HAVING COUNT(*) >= ?`,
    [areaId, areaId, MIN_CO_COUNT]
  );
  return rows.map((row) => ({
    productId: toNumber(row.productId),
    pairedId: toNumber(row.pairedId),
    coCount: toNumber(row.coCount),
    weighted: toNumber(row.weighted),
  }));
};

const loadCatalogue = async (areaId) => {
  const [rows] = await pool.query(
    'SELECT id, name, category_id FROM products WHERE area_id = ? AND deleted = 0',
    [areaId]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, categoryId: row.category_id }));
};

const flattenMatches = (areaId, matchesByItem, source) => {
  const rows = [];
  for (const [itemId, matches] of matchesByItem) {
    for (const match of matches) {
      const row = [areaId, itemId, match.pairedId, Number(match.score.toFixed(6)), match.coCount];
      if (source) row.push(source);
      rows.push(row);
    }
  }
  return rows;
};

// Replace one area's rows atomically: readers see yesterday's matches until
// COMMIT, then today's — never an empty table in between. A failed build
// rolls back and leaves yesterday's rows serving.
const replaceAreaRows = async (areaId, productRows, categoryRows) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM product_pairs WHERE area_id = ?', [areaId]);
    for (let i = 0; i < productRows.length; i += INSERT_BATCH) {
      await connection.query(
        'INSERT INTO product_pairs (area_id, product_id, paired_product_id, score, co_count, source) VALUES ?',
        [productRows.slice(i, i + INSERT_BATCH)]
      );
    }
    await connection.query('DELETE FROM category_pairs WHERE area_id = ?', [areaId]);
    for (let i = 0; i < categoryRows.length; i += INSERT_BATCH) {
      await connection.query(
        'INSERT INTO category_pairs (area_id, category_id, paired_category_id, score, co_count) VALUES ?',
        [categoryRows.slice(i, i + INSERT_BATCH)]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

/** Build and store one area's pairs. Returns counts for logging. */
const buildAreaPairs = async (areaId) => {
  // One query at a time on purpose: slower by seconds, but never more than
  // one heavy query on the shared database at once.
  const totalWeight = await loadTotals(areaId);
  const productWeights = await loadItemWeights(PRODUCT_ITEMS, areaId);
  const productPairRows = await loadPairRows(PRODUCT_ITEMS, areaId);
  const categoryWeights = await loadItemWeights(CATEGORY_ITEMS, areaId);
  const categoryPairRows = await loadPairRows(CATEGORY_ITEMS, areaId);
  const catalogue = await loadCatalogue(areaId);

  const learned = scorePairs({ pairRows: productPairRows, itemWeights: productWeights, totalWeight });
  const borrowed = borrowFromSimilar(catalogue, learned);
  const categoryMatches = scorePairs({ pairRows: categoryPairRows, itemWeights: categoryWeights, totalWeight });

  const productRows = [
    ...flattenMatches(areaId, learned, 'orders'),
    ...flattenMatches(areaId, borrowed, 'similar'),
  ];
  const categoryRows = flattenMatches(areaId, categoryMatches);

  await replaceAreaRows(areaId, productRows, categoryRows);
  return {
    areaId,
    learnedProducts: learned.size,
    borrowedProducts: borrowed.size,
    productRows: productRows.length,
    categoryRows: categoryRows.length,
  };
};

let running = false;

/** Build every active area. One area failing never stops the others. */
const buildAllPairs = async () => {
  if (running) return [];
  running = true;
  const results = [];
  try {
    const areas = await listAreas({ activeOnly: true });
    for (const area of areas) {
      try {
        const result = await buildAreaPairs(area.id);
        results.push(result);
        logger.info(result, '[suggestions] pairs built');
      } catch (error) {
        logger.error({ err: error, areaId: area.id }, '[suggestions] area build failed');
      }
    }
  } finally {
    running = false;
  }
  return results;
};

const isStale = async () => {
  const [rows] = await pool.query(
    `SELECT MAX(updated_at) IS NULL OR MAX(updated_at) < NOW() - INTERVAL ${STALE_AFTER_HOURS} HOUR AS stale
     FROM product_pairs`
  );
  return Boolean(rows[0] && Number(rows[0].stale));
};

let bootTimer = null;
let nightlyTimer = null;

const startSuggestionScheduler = () => {
  // Catch up once after boot (a deploy/restart can skip 03:00), after a short
  // delay so it never competes with startup work.
  bootTimer = setTimeout(async () => {
    try {
      if (await isStale()) await buildAllPairs();
    } catch (error) {
      logger.error({ err: error }, '[suggestions] boot build failed');
    }
  }, BOOT_DELAY_MS);
  bootTimer.unref();

  const scheduleNext = () => {
    nightlyTimer = setTimeout(async () => {
      try {
        await buildAllPairs();
      } catch (error) {
        logger.error({ err: error }, '[suggestions] nightly build failed');
      }
      scheduleNext();
    }, msUntilNextIst(RUN_HOUR, RUN_MINUTE));
    nightlyTimer.unref();
  };
  scheduleNext();
};

const stopSuggestionScheduler = () => {
  if (bootTimer) clearTimeout(bootTimer);
  if (nightlyTimer) clearTimeout(nightlyTimer);
  bootTimer = null;
  nightlyTimer = null;
};

module.exports = {
  buildAllPairs,
  buildAreaPairs,
  startSuggestionScheduler,
  stopSuggestionScheduler,
};

// CLI: `npm run suggestions:build` — build now instead of waiting for 03:00
// (e.g. right after the first deploy). Needs only MySQL.
if (require.main === module) {
  buildAllPairs()
    .then((results) => {
      logger.info({ areas: results.length }, '[suggestions] manual build done');
      return pool.end();
    })
    .catch((error) => {
      logger.error({ err: error }, '[suggestions] manual build failed');
      process.exit(1);
    });
}
