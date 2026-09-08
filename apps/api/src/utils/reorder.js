/**
 * Drag-and-drop reorder, as ONE statement instead of one UPDATE per row.
 *
 * Every reorder endpoint used to loop `UPDATE ... SET display_order = ?` per
 * id. MySQL is in a different region from the API (~94ms per query — see
 * riders.js/orderController.js), so reordering 20 products cost ~1.9s of pure
 * round trips, plus a BEGIN and a COMMIT. A single CASE-based UPDATE is one
 * round trip regardless of list length, and is atomic on its own, so callers
 * no longer need a transaction to wrap it.
 *
 * `table`, `idColumn` and `where` are always caller-supplied literals, never
 * request data. Ids and their new positions are parameterized as usual.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} conn
 * @param {{
 *   table: string,
 *   ids: Array<number|string>,
 *   idColumn?: string,
 *   where?: string,        // extra predicates, each starting with ' AND '
 *   whereParams?: any[],
 * }} spec
 * @returns {Promise<number>} rows actually updated — fewer than ids.length
 *   means some ids failed the scope predicates (wrong area, wrong section).
 */
const reorderDisplayOrder = async (conn, { table, ids, idColumn = 'id', where = '', whereParams = [] }) => {
  if (!Array.isArray(ids) || ids.length === 0) return 0;

  const cases = ids.map(() => 'WHEN ? THEN ?').join(' ');
  const params = [];
  ids.forEach((id, index) => {
    params.push(id, index);
  });
  // IN (?) so the statement only touches the listed rows; anything outside the
  // list keeps its current display_order, exactly like the per-row loop did.
  params.push(ids, ...whereParams);

  const [result] = await conn.query(
    `UPDATE ${table} SET display_order = CASE ${idColumn} ${cases} END
     WHERE ${idColumn} IN (?)${where}`,
    params
  );
  return result.affectedRows;
};

module.exports = { reorderDisplayOrder };
