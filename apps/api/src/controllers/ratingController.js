const { pool } = require('../db/mysql');
const { requestAreaId } = require('../utils/areaScope');
const { getAreaProductRatings } = require('../utils/productRatings');

/**
 * Food ratings: a customer's 1-5 stars for one line of their own Delivered
 * order (table order_item_ratings, migrate.js "FOOD RATINGS").
 *
 * A rating can be changed only while the customer stays on the Orders page.
 * The app sends the id of its current page visit (editSession, new each time
 * the page gains focus); only the visit that saved a rating may change it, so
 * it locks once they leave the page or close the app.
 */

const ratingPayload = (orderId, orderItemId, stars) => ({
  orderId,
  order_id: orderId,
  orderItemId,
  order_item_id: orderItemId,
  stars,
  myRating: stars,
  my_rating: stars,
});

const rateOrderItem = async (req, res) => {
  const userId = req.user.id;
  const orderId = Number(req.params.id);
  const orderItemId = Number(req.params.itemId);
  const { stars, editSession } = req.validatedData;

  const [rows] = await pool.query(
    `SELECT oi.id, oi.area_id, oi.item_type, oi.product_id, o.status,
            r.stars AS rated_stars, r.edit_session
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id AND o.customer_id = ?
       LEFT JOIN order_item_ratings r ON r.order_item_id = oi.id AND r.area_id = oi.area_id
      WHERE oi.id = ? AND oi.order_id = ?`,
    [userId, orderItemId, orderId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Order item not found' });
  }

  const item = rows[0];
  if (item.status !== 'Delivered') {
    return res.status(409).json({
      code: 'ORDER_NOT_DELIVERED',
      message: 'You can rate an order once it is delivered.',
    });
  }

  const locked = (savedStars) => res.status(409).json({
    code: 'RATING_LOCKED',
    message: 'This rating is already saved.',
    data: ratingPayload(orderId, orderItemId, Number(savedStars)),
  });

  if (item.rated_stars != null && item.edit_session !== editSession) {
    return locked(item.rated_stars);
  }

  // The IF keeps the saved stars when another visit wrote the row between
  // the read above and this write (two phones on one account).
  await pool.query(
    `INSERT INTO order_item_ratings
       (area_id, order_id, order_item_id, customer_id, item_type, product_id, stars, edit_session)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE stars = IF(edit_session = VALUES(edit_session), VALUES(stars), stars)`,
    [item.area_id, orderId, orderItemId, userId, item.item_type || 'product', item.product_id, stars, editSession]
  );

  // A first rating can lose that race; read back whose stars were kept so
  // the answer never claims stars that were not saved. A change (the row was
  // already this visit's) cannot lose it, so it skips the read.
  if (item.rated_stars == null) {
    const [savedRows] = await pool.query(
      'SELECT stars, edit_session FROM order_item_ratings WHERE order_item_id = ? AND area_id = ?',
      [orderItemId, item.area_id]
    );
    const saved = savedRows[0];
    if (saved && saved.edit_session !== editSession) return locked(saved.stars);
  }

  res.status(200).json({ data: ratingPayload(orderId, orderItemId, stars) });
};

/**
 * GET /api/products/ratings — the rating every product card shows, for the
 * customer's area (utils/productRatings.js has the formula). A separate,
 * cached read so the catalog responses and their ETags stay as they are.
 */
const getProductRatings = async (req, res) => {
  const areaId = requestAreaId(req);
  const items = areaId == null ? [] : await getAreaProductRatings(areaId);
  res.set('Cache-Control', 'private, max-age=300');
  res.status(200).json({ data: { areaId, area_id: areaId, items } });
};

module.exports = {
  rateOrderItem,
  getProductRatings,
};
