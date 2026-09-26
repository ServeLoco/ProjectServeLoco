// Who counts as an AREA's customer. Customers are global accounts (one phone
// nationwide, §2.2), so "Area 2's customers" means: whose phone was last seen
// in the area (users.current_area_id, from the live pin), or who have ordered
// there. One definition, used wherever an area admin's view of customers is
// narrowed to their own area (customer lookups, reports, phone broadcasts).

const { pool } = require('../db/mysql');

/**
 * SQL condition on a `users` row aliased `u`; binds the area id twice.
 * @example `WHERE ${AREA_CUSTOMER_SQL}`, [areaId, areaId]
 */
const AREA_CUSTOMER_SQL = '(u.current_area_id = ? OR EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = u.id AND o.area_id = ?))';

/** Is this user one of the area's customers? */
const isAreaCustomer = async (userId, areaId) => {
  const [rows] = await pool.query(
    `SELECT 1 FROM users u WHERE u.id = ? AND ${AREA_CUSTOMER_SQL} LIMIT 1`,
    [userId, areaId, areaId]
  );
  return rows.length > 0;
};

module.exports = { AREA_CUSTOMER_SQL, isAreaCustomer };
