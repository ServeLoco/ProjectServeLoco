// GET /api/cart/suggestions — the cart's "Add more" row.
//
// Reads what the nightly build (services/suggestions/buildPairs.js) already
// learned; nothing is computed from raw orders here except the customer's own
// recent history. Each cart item votes for its learned matches and the votes
// add up, so an item that goes with two things in the cart ranks first. When
// the learned matches run short, the cart's categories' learned partner
// categories fill in, then the area's best sellers.
//
// Any failure answers an empty list — this row must never break the cart.

const { pool } = require('../db/mysql');
const microCache = require('../utils/microCache');
const { requestAreaId } = require('../utils/areaScope');
const { isWithinTimeWindow } = require('../utils/timeWindow');
const { attachVariants } = require('./productController');
const { resolveImageUrls, mapProductRows } = require('./dashboardController');
const logger = require('../utils/logger');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_CART_IDS = 30;
const MAX_PER_CATEGORY = 2;
// Candidates kept in cache — more than the row shows, so dropping in-cart,
// out-of-hours and per-category overflow still leaves enough.
const CANDIDATE_POOL = 40;
const TOP_SELLER_DAYS = 30;
const PERSONAL_ORDERS = 20;
// Catalogue edits bust this early (bustAreaCaches); the TTL only covers what
// no admin write announces, like a shop's scheduled open/close.
const CACHE_TTL_MS = 120_000;

// Tiers: a learned product match always outranks a category guess, which
// always outranks plain popularity.
const CATEGORY_WEIGHT = 0.3;
const POPULAR_WEIGHT = 0.01;
const PERSONAL_BOOST = 0.5;

// Same "can be bought right now" rules as Home rows (dashboardController's
// product_block): available, not deleted, shop open, group active.
const SELLABLE = `p.available = 1 AND p.deleted = 0 AND p.is_combo = 0 AND p.area_id = ?
  AND (p.shop_id IS NULL OR EXISTS (SELECT 1 FROM shops s WHERE s.id = p.shop_id AND s.is_open = 1 AND s.active = 1))
  AND (p.group_id IS NULL OR EXISTS (SELECT 1 FROM product_groups g WHERE g.id = p.group_id AND g.active = 1 AND g.area_id = p.area_id))`;

const parseIds = (raw) => {
  const list = Array.isArray(raw) ? raw.join(',') : String(raw || '');
  const ids = list
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].sort((a, b) => a - b).slice(0, MAX_CART_IDS);
};

const addVote = (votes, id, score) => {
  votes.set(id, (votes.get(id) || 0) + score);
};

const loadTopSellers = async (areaId) => {
  const [rows] = await pool.query(
    `SELECT oi.product_id, COUNT(DISTINCT o.id) AS orders
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.area_id = ? AND o.status = 'Delivered'
       AND o.created_at >= NOW() - INTERVAL ${TOP_SELLER_DAYS} DAY
       AND oi.item_type = 'product'
     GROUP BY oi.product_id
     ORDER BY orders DESC
     LIMIT ${CANDIDATE_POOL}`,
    [areaId]
  );
  const best = Number(rows[0] && rows[0].orders) || 1;
  return rows.map((row) => ({ id: Number(row.product_id), popularity: Number(row.orders) / best }));
};

/**
 * Everything that does not depend on who is asking: scored, sellable,
 * fully shaped products for this set of cart items. Cached per area + cart.
 */
const buildCandidates = async (areaId, cartIds) => {
  const [[pairRows], [cartRows], topSellers] = await Promise.all([
    pool.query(
      'SELECT paired_product_id, score FROM product_pairs WHERE area_id = ? AND product_id IN (?)',
      [areaId, cartIds]
    ),
    pool.query('SELECT id, category_id FROM products WHERE area_id = ? AND id IN (?)', [areaId, cartIds]),
    loadTopSellers(areaId),
  ]);

  const votes = new Map();
  for (const row of pairRows) addVote(votes, Number(row.paired_product_id), Number(row.score));

  const cartCategoryIds = [...new Set(cartRows.map((row) => row.category_id))];
  const categoryScores = new Map();
  if (cartCategoryIds.length > 0) {
    const [categoryRows] = await pool.query(
      'SELECT paired_category_id, score FROM category_pairs WHERE area_id = ? AND category_id IN (?)',
      [areaId, cartCategoryIds]
    );
    for (const row of categoryRows) addVote(categoryScores, Number(row.paired_category_id), Number(row.score));
  }

  const inCart = new Set(cartIds);
  const popularity = new Map(topSellers.map((seller) => [seller.id, seller.popularity]));
  const candidateIds = [...new Set([...votes.keys(), ...popularity.keys()])].filter((id) => !inCart.has(id));
  if (candidateIds.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT p.*, cat.name AS category_name, cat.type AS category_type, 1 AS shop_is_open
     FROM products p
     LEFT JOIN categories cat ON cat.id = p.category_id
     WHERE p.id IN (?) AND ${SELLABLE}`,
    [candidateIds, areaId]
  );

  const scored = rows.map((row) => {
    const pop = popularity.get(row.id) || 0;
    const score = (votes.get(row.id) || 0)
      + (categoryScores.get(row.category_id) || 0) * CATEGORY_WEIGHT * Math.max(pop, 0.1)
      + pop * POPULAR_WEIGHT;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score || a.row.id - b.row.id);
  const top = scored.slice(0, CANDIDATE_POOL);

  const topRows = top.map((entry) => entry.row);
  await Promise.all([resolveImageUrls(topRows), attachVariants(topRows)]);
  const shaped = mapProductRows(topRows);
  return top.map((entry, index) => ({
    score: entry.score,
    from: entry.row.available_from_time,
    until: entry.row.available_until_time,
    product: shaped[index],
  }));
};

/** How many of the customer's last orders (this area) had each product. */
const loadPersonalCounts = async (areaId, userId) => {
  if (!userId) return new Map();
  const [rows] = await pool.query(
    `SELECT oi.product_id, COUNT(DISTINCT oi.order_id) AS times
     FROM order_items oi
     JOIN (
       SELECT id FROM orders
       WHERE area_id = ? AND customer_id = ? AND status = 'Delivered'
       ORDER BY created_at DESC
       LIMIT ${PERSONAL_ORDERS}
     ) recent ON recent.id = oi.order_id
     GROUP BY oi.product_id`,
    [areaId, userId]
  );
  return new Map(rows.map((row) => [Number(row.product_id), Number(row.times)]));
};

const pickSuggestions = (candidates, personal, limit) => {
  const ranked = candidates
    .filter((candidate) => isWithinTimeWindow(candidate.from, candidate.until))
    .map((candidate) => {
      const times = personal.get(candidate.product.id) || 0;
      const boost = 1 + PERSONAL_BOOST * Math.min(times, 4) / 4;
      return { ...candidate, score: candidate.score * boost };
    })
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id);

  const perCategory = new Map();
  const picked = [];
  for (const candidate of ranked) {
    const categoryId = candidate.product.categoryId;
    const used = perCategory.get(categoryId) || 0;
    if (used >= MAX_PER_CATEGORY) continue;
    perCategory.set(categoryId, used + 1);
    picked.push(candidate.product);
    if (picked.length >= limit) break;
  }
  return picked;
};

const respond = (res, products) => res.status(200).json({ data: { products }, products });

const getCartSuggestions = async (req, res) => {
  const areaId = requestAreaId(req);
  const cartIds = parseIds(req.query.productIds ?? req.query.product_ids);
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  if (areaId === null || areaId === 'all' || cartIds.length === 0) return respond(res, []);

  try {
    const cacheKey = `suggest:${areaId}:${cartIds.join(',')}`;
    let candidates = microCache.get(cacheKey);
    if (!candidates) {
      candidates = await buildCandidates(areaId, cartIds);
      microCache.set(cacheKey, candidates, CACHE_TTL_MS);
    }
    if (candidates.length === 0) return respond(res, []);
    const personal = await loadPersonalCounts(areaId, req.user?.id);
    return respond(res, pickSuggestions(candidates, personal, limit));
  } catch (error) {
    logger.error({ err: error, areaId }, '[suggestions] cart suggestions failed');
    return respond(res, []);
  }
};

module.exports = { getCartSuggestions, parseIds, pickSuggestions };
