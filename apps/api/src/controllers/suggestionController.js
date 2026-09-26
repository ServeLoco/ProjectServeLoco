// GET /api/cart/suggestions — the cart's "Add more" row.
//
// Reads what the nightly build (services/suggestions/buildPairs.js) already
// learned; nothing is computed from raw orders here except the customer's own
// recent history. Each cart item votes for its learned matches and the votes
// add up, so an item that goes with two things in the cart ranks first. When
// the learned matches run short, the cart's categories' learned partner
// categories fill in. Whatever is still empty is filled from the cart's own
// shop mode (fast food, packed…): the same shop's items first, then the
// mode's best sellers — so the row is there even before anything is learned,
// and never jumps to another mode just because something sells well there.
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
// How many same-mode products are read to fill the row.
const FILL_POOL = 40;
const PERSONAL_ORDERS = 20;
// Catalogue edits bust this early (bustAreaCaches); the TTL only covers what
// no admin write announces, like a shop's scheduled open/close.
const CACHE_TTL_MS = 120_000;

// Tiers: anything related to the cart (a learned match or a partner
// category) always ranks above plain filler. Within the filler, the cart's
// own shop comes before the rest of the mode, then best sellers.
const CATEGORY_WEIGHT = 0.3;
const POPULAR_WEIGHT = 0.01;
const SAME_SHOP_WEIGHT = 0.02;
// A customer's own habit, scaled by how often (up to PERSONAL_MAX_TIMES of
// their recent orders): their score grows by up to half, and an item that
// relates to the cart (a learned pair or a partner category) also gets up to
// half of the best candidate's score on top — enough for "always buys
// Sprite" to show Sprite next to a burger, never enough to push in
// something unrelated to the cart.
const PERSONAL_BOOST = 0.5;
const PERSONAL_RELATED_SHARE = 0.5;
const PERSONAL_MAX_TIMES = 4;

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

// Related before filler, then by score, then by id so equal scores keep a
// stable order.
const byRank = (idOf) => (a, b) => (Number(b.related) - Number(a.related))
  || (b.score - a.score)
  || (idOf(a) - idOf(b));

// Counted by the nightly build (product_popularity) — aggregating recent
// orders here took ~0.7s per uncached cart at 100k orders.
const loadTopSellers = async (areaId) => {
  const [rows] = await pool.query(
    `SELECT product_id, orders FROM product_popularity
     WHERE area_id = ?
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
/**
 * Sellable products of the cart's shop modes, the cart's own shops first,
 * then the mode's best sellers. A cart line with no shop (the platform's own
 * stock) counts products with no shop as "the same shop".
 */
const loadModeFill = async (areaId, cartIds, modes, shopIds, hasNoShopItem) => {
  if (modes.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT p.id
     FROM products p
     JOIN categories c ON c.id = p.category_id AND c.active = 1 AND c.deleted = 0
     LEFT JOIN product_popularity pop ON pop.area_id = p.area_id AND pop.product_id = p.id
     WHERE c.type IN (?) AND p.id NOT IN (?) AND ${SELLABLE}
     ORDER BY (p.shop_id IN (?) OR (? AND p.shop_id IS NULL)) DESC, COALESCE(pop.orders, 0) DESC, p.id ASC
     LIMIT ${FILL_POOL}`,
    [modes, cartIds, areaId, shopIds.length > 0 ? shopIds : [0], hasNoShopItem ? 1 : 0]
  );
  return rows.map((row) => Number(row.id));
};

const buildCandidates = async (areaId, cartIds) => {
  const [[pairRows], [cartRows], topSellers] = await Promise.all([
    pool.query(
      'SELECT paired_product_id, score FROM product_pairs WHERE area_id = ? AND product_id IN (?)',
      [areaId, cartIds]
    ),
    pool.query(
      `SELECT p.id, p.category_id, p.shop_id, c.type AS mode
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.area_id = ? AND p.id IN (?)`,
      [areaId, cartIds]
    ),
    loadTopSellers(areaId),
  ]);

  const votes = new Map();
  for (const row of pairRows) addVote(votes, Number(row.paired_product_id), Number(row.score));

  const cartCategoryIds = [...new Set(cartRows.map((row) => row.category_id))];
  const modes = [...new Set(cartRows.map((row) => row.mode).filter(Boolean))];
  const cartShopIds = [...new Set(cartRows.map((row) => row.shop_id).filter((id) => id != null).map(Number))];
  const hasNoShopItem = cartRows.some((row) => row.shop_id == null);

  const [categoryRows, fillIds] = await Promise.all([
    cartCategoryIds.length > 0
      ? pool.query(
        'SELECT paired_category_id, score FROM category_pairs WHERE area_id = ? AND category_id IN (?)',
        [areaId, cartCategoryIds]
      ).then(([rows]) => rows)
      : [],
    loadModeFill(areaId, cartIds, modes, cartShopIds, hasNoShopItem),
  ]);
  const categoryScores = new Map();
  for (const row of categoryRows) addVote(categoryScores, Number(row.paired_category_id), Number(row.score));

  const inCart = new Set(cartIds);
  const popularity = new Map(topSellers.map((seller) => [seller.id, seller.popularity]));
  const candidateIds = [...new Set([...votes.keys(), ...popularity.keys(), ...fillIds])].filter((id) => !inCart.has(id));
  if (candidateIds.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT p.*, cat.name AS category_name, cat.type AS category_type, 1 AS shop_is_open
     FROM products p
     LEFT JOIN categories cat ON cat.id = p.category_id
     WHERE p.id IN (?) AND ${SELLABLE}`,
    [candidateIds, areaId]
  );

  const modeSet = new Set(modes);
  const isSameShop = (row) => (row.shop_id == null ? hasNoShopItem : cartShopIds.includes(Number(row.shop_id)));
  const scored = [];
  for (const row of rows) {
    const pop = popularity.get(row.id) || 0;
    const vote = votes.get(row.id) || 0;
    const categoryScore = categoryScores.get(row.category_id) || 0;
    const related = vote > 0 || categoryScore > 0;
    // Plain filler stays in the cart's own shop mode.
    if (!related && !modeSet.has(row.category_type)) continue;
    const score = related
      ? vote + categoryScore * CATEGORY_WEIGHT * Math.max(pop, 0.1) + pop * POPULAR_WEIGHT
      : (isSameShop(row) ? SAME_SHOP_WEIGHT : 0) + pop * POPULAR_WEIGHT;
    scored.push({ row, score, related });
  }
  scored.sort(byRank((entry) => entry.row.id));
  const top = scored.slice(0, CANDIDATE_POOL);

  const topRows = top.map((entry) => entry.row);
  await Promise.all([resolveImageUrls(topRows), attachVariants(topRows)]);
  const shaped = mapProductRows(topRows);
  return top.map((entry, index) => ({
    score: entry.score,
    related: entry.related,
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
  const sellable = candidates.filter((candidate) => isWithinTimeWindow(candidate.from, candidate.until));
  const best = sellable.reduce((max, candidate) => Math.max(max, candidate.score), 0);
  const ranked = sellable
    .map((candidate) => {
      const habit = Math.min(personal.get(candidate.product.id) || 0, PERSONAL_MAX_TIMES) / PERSONAL_MAX_TIMES;
      const score = candidate.score * (1 + PERSONAL_BOOST * habit)
        + (candidate.related ? best * PERSONAL_RELATED_SHARE * habit : 0);
      return { ...candidate, score };
    })
    .sort(byRank((candidate) => candidate.product.id));

  const perCategory = new Map();
  const picked = [];
  const skipped = [];
  for (const candidate of ranked) {
    if (picked.length >= limit) break;
    const categoryId = candidate.product.categoryId;
    const used = perCategory.get(categoryId) || 0;
    if (used >= MAX_PER_CATEGORY) {
      skipped.push(candidate.product);
      continue;
    }
    perCategory.set(categoryId, used + 1);
    picked.push(candidate.product);
  }
  // The 2-per-category rule is for variety; when a small shop has nothing
  // else, a full row beats a half-empty one.
  return picked.concat(skipped.slice(0, limit - picked.length));
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
