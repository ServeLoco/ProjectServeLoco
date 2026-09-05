/**
 * utils/reorder.js — drag-and-drop reorder as ONE statement. Every reorder
 * endpoint used to issue one UPDATE per row, which at ~94ms per cross-region
 * round trip made a 20-item reorder take ~1.9s.
 */
const { reorderDisplayOrder } = require('../src/utils/reorder');

const makeConn = (affectedRows = 0) => ({
  query: jest.fn().mockResolvedValue([{ affectedRows }]),
});

describe('reorderDisplayOrder', () => {
  it('issues exactly one statement regardless of list length', async () => {
    const conn = makeConn(20);
    await reorderDisplayOrder(conn, {
      table: 'dashboard_sections',
      ids: Array.from({ length: 20 }, (_, i) => i + 1),
    });
    expect(conn.query).toHaveBeenCalledTimes(1);
  });

  it('builds a CASE mapping each id to its index, scoped by IN (?)', async () => {
    const conn = makeConn(3);
    await reorderDisplayOrder(conn, { table: 'dashboard_sections', ids: [7, 5, 9] });

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain('UPDATE dashboard_sections SET display_order = CASE id WHEN ? THEN ? WHEN ? THEN ? WHEN ? THEN ? END');
    expect(sql).toContain('WHERE id IN (?)');
    // id/position pairs in list order, then the IN list. Rows outside the list
    // keep their current display_order, exactly like the per-row loop did.
    expect(params).toEqual([7, 0, 5, 1, 9, 2, [7, 5, 9]]);
  });

  it('appends caller scope predicates and their params after the IN list', async () => {
    const conn = makeConn(2);
    await reorderDisplayOrder(conn, {
      table: 'dashboard_section_items',
      ids: [4, 6],
      where: ' AND section_id = ? AND deleted_at IS NULL',
      whereParams: [77],
    });

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain('WHERE id IN (?) AND section_id = ? AND deleted_at IS NULL');
    expect(params).toEqual([4, 0, 6, 1, [4, 6], 77]);
  });

  it('honours a non-default idColumn (offer_products keys on product_id)', async () => {
    const conn = makeConn(2);
    await reorderDisplayOrder(conn, {
      table: 'offer_products',
      ids: [11, 12],
      idColumn: 'product_id',
      where: ' AND offer_id = ?',
      whereParams: [3],
    });

    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toContain('SET display_order = CASE product_id');
    expect(sql).toContain('WHERE product_id IN (?) AND offer_id = ?');
    expect(params).toEqual([11, 0, 12, 1, [11, 12], 3]);
  });

  it('is a no-op for an empty or non-array list — never emits a broken IN ()', async () => {
    const conn = makeConn();
    expect(await reorderDisplayOrder(conn, { table: 't', ids: [] })).toBe(0);
    expect(await reorderDisplayOrder(conn, { table: 't', ids: undefined })).toBe(0);
    expect(conn.query).not.toHaveBeenCalled();
  });

  it('returns affectedRows so a caller can tell scope predicates rejected ids', async () => {
    const conn = makeConn(1);
    const updated = await reorderDisplayOrder(conn, {
      table: 'dashboard_sections',
      ids: [1, 2],
      where: ' AND area_id = ?',
      whereParams: [1],
    });
    expect(updated).toBe(1); // one of the two ids belonged to another area
  });
});
