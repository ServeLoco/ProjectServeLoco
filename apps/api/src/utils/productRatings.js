const { pool } = require('../db/mysql');
const { createTtlCache } = require('./ttlCache');

/**
 * The rating customers see on a product card — one formula, used by the
 * customer endpoint (GET /products/ratings) and the admin Food Ratings
 * report, so both always show the same number.
 *
 *  - Every delivered order line of the product counts. A line the customer
 *    never rated counts as 5 stars: 400 orders with two 1-star ratings is
 *    (398 x 5 + 1 + 1) / 400 = 4.98.
 *  - The shown rating never goes below RATING_FLOOR (3.5).
 *  - Above FIRE_ABOVE (4.8, compared on the rounded value the card shows)
 *    the card adds a fire badge.
 *  - A product with no delivered order has no rating (nothing to average).
 */
const UNRATED_STARS = 5;
const RATING_FLOOR = 3.5;
const FIRE_ABOVE = 4.8;

// Stars "lost" to real ratings across the grouped order lines; unrated lines
// (r.stars NULL) lose nothing, which is what makes them count as 5.
const STARS_MISSING_SQL = `COALESCE(SUM(${UNRATED_STARS} - r.stars), 0)`;

const shownRating = (ordersCount, starsMissing) => {
  const orders = Number(ordersCount) || 0;
  if (orders <= 0) return null;
  const average = UNRATED_STARS - (Number(starsMissing) || 0) / orders;
  return Math.round(Math.max(RATING_FLOOR, average) * 10) / 10;
};

const isFire = (rating) => rating != null && rating > FIRE_ABOVE;

const loadAreaProductRatings = async (areaId) => {
  const [rows] = await pool.query(
    `SELECT oi.item_type, oi.product_id,
            COUNT(*) AS orders_count,
            ${STARS_MISSING_SQL} AS stars_missing
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN order_item_ratings r ON r.order_item_id = oi.id AND r.area_id = oi.area_id
      WHERE o.area_id = ? AND o.status = 'Delivered'
      GROUP BY oi.item_type, oi.product_id`,
    [areaId]
  );
  return rows.map((row) => {
    const itemType = row.item_type || 'product';
    const ordersCount = Number(row.orders_count);
    const rating = shownRating(ordersCount, row.stars_missing);
    const fire = isFire(rating);
    return {
      itemType,
      item_type: itemType,
      productId: row.product_id,
      product_id: row.product_id,
      rating,
      fire,
      ordersCount,
      orders_count: ordersCount,
    };
  });
};

// Ratings move slowly; ten minutes of staleness is fine and keeps the
// aggregate off every card view. Keyed by area id (a small, fixed set).
const areaRatingsCache = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 50 });
// When the cache runs out, every customer opening the app at that moment
// would run the aggregate at once; they share one query instead. A failed
// load is not cached, so the next request tries again.
const loadsInFlight = new Map();

const getAreaProductRatings = async (areaId) => {
  const key = String(areaId);
  const cached = areaRatingsCache.get(key);
  if (cached !== undefined) return cached;
  if (!loadsInFlight.has(key)) {
    const load = loadAreaProductRatings(areaId)
      .then((items) => {
        areaRatingsCache.set(key, items);
        return items;
      })
      .finally(() => {
        if (loadsInFlight.get(key) === load) loadsInFlight.delete(key);
      });
    loadsInFlight.set(key, load);
  }
  return loadsInFlight.get(key);
};

module.exports = {
  UNRATED_STARS,
  RATING_FLOOR,
  FIRE_ABOVE,
  STARS_MISSING_SQL,
  shownRating,
  isFire,
  getAreaProductRatings,
  clearProductRatingsCache: () => {
    areaRatingsCache.del();
    loadsInFlight.clear();
  },
};
