// Home's automatic rows (a row per shop / category, stored in
// dashboard_sections) against a REAL MySQL.
//
// The bug this pins: every screen that lists rows (the customer Home, the admin
// App Home page) first runs syncAutoSections, and two of them at the same moment
// each saw "this shop has no row yet" and each inserted one — so Sweets and
// Everyday showed every automatic row twice. The old guard, an INSERT IGNORE
// against the (area, mode, slug, deleted_at) key, never fired: MySQL treats
// NULLs as different inside a unique key and a live row has deleted_at = NULL.
// A mocked pool can't show that, only a server can.
//
// Fixtures live in a made-up shop mode (tagged like the other integration
// files) so they never touch the rows a developer already has.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const {
  DB_TESTS_ENABLED, describeWithMysql, assertMysqlReady, pool, FIXTURE_TAG,
} = require('../helpers/realMysql');
const { syncAutoSections } = require('../../src/utils/autoSections');
const { removeDuplicateAutoSections, AUTO_SECTION_KEY_INDEX } = require('../../src/db/autoSectionKey');

const MODE = FIXTURE_TAG.toLowerCase();
const AREA_ID = 1;
const CATEGORY_COUNT = 3;

const autoRows = async (mode = MODE) => {
  const [rows] = await pool.query(
    `SELECT id, slug, auto_kind, auto_source_id, deleted_at
       FROM dashboard_sections
      WHERE area_id = ? AND store_type = ? AND auto_kind IS NOT NULL
      ORDER BY id`,
    [AREA_ID, mode]
  );
  return rows;
};

const removeFixtures = async () => {
  await pool.query('DELETE FROM dashboard_sections WHERE store_type = ?', [MODE]);
  await pool.query(
    `DELETE p FROM products p JOIN categories c ON c.id = p.category_id WHERE c.slug LIKE ?`,
    [`${FIXTURE_TAG.toLowerCase()}-%`]
  );
  await pool.query('DELETE FROM categories WHERE slug LIKE ?', [`${FIXTURE_TAG.toLowerCase()}-%`]);
};

describeWithMysql('automatic Home rows — overlapping syncs', () => {
  const categoryIds = [];

  beforeAll(async () => {
    await assertMysqlReady();
    await removeFixtures();
    for (let i = 1; i <= CATEGORY_COUNT; i += 1) {
      const [category] = await pool.query(
        `INSERT INTO categories (name, slug, type, area_id, active, deleted) VALUES (?, ?, ?, ?, 1, 0)`,
        [`${FIXTURE_TAG} Category ${i}`, `${FIXTURE_TAG.toLowerCase()}-${i}`, MODE, AREA_ID]
      );
      categoryIds.push(category.insertId);
      await pool.query(
        `INSERT INTO products (name, price, category_id, area_id, available, deleted, is_combo)
         VALUES (?, 50, ?, ?, 1, 0, 0)`,
        [`${FIXTURE_TAG} Item ${i}`, category.insertId, AREA_ID]
      );
    }
  });

  afterAll(async () => {
    await removeFixtures();
  });

  it('creates each row exactly once when many requests sync at the same moment', async () => {
    await Promise.all(Array.from({ length: 10 }, () => syncAutoSections(AREA_ID, MODE)));

    const rows = await autoRows();
    expect(rows).toHaveLength(CATEGORY_COUNT);
    expect(new Set(rows.map((row) => row.auto_source_id))).toEqual(new Set(categoryIds));
    expect(new Set(rows.map((row) => row.slug)).size).toBe(CATEGORY_COUNT);
  });

  it('keeps one row per source across later syncs, and never brings back one the admin deleted', async () => {
    const [first] = await autoRows();
    await pool.query('UPDATE dashboard_sections SET deleted_at = NOW() WHERE id = ?', [first.id]);

    await Promise.all(Array.from({ length: 5 }, () => syncAutoSections(AREA_ID, MODE)));

    const rows = await autoRows();
    expect(rows).toHaveLength(CATEGORY_COUNT);
    expect(rows.find((row) => row.id === first.id).deleted_at).not.toBeNull();
  });

  it('refuses a second row for the same shop/category even by a direct insert', async () => {
    const [existing] = await autoRows();
    const [result] = await pool.query(
      `INSERT IGNORE INTO dashboard_sections
         (area_id, title, slug, section_type, store_type, active, display_order, auto_kind, auto_source_id, version)
       VALUES (?, 'Copy', ?, 'product_block', ?, 1, 99, ?, ?, 1)`,
      [AREA_ID, `${existing.slug}-copy`, MODE, existing.auto_kind, existing.auto_source_id]
    );
    expect(result.affectedRows).toBe(0);
    expect(await autoRows()).toHaveLength(CATEGORY_COUNT);
  });

  it("leaves the admin's own sections alone — the key only applies to automatic rows", async () => {
    const insertManual = (slug) => pool.query(
      `INSERT INTO dashboard_sections (area_id, title, slug, section_type, store_type, active, display_order, version)
       VALUES (?, 'Manual', ?, 'product_block', ?, 1, 50, 1)`,
      [AREA_ID, slug, MODE]
    );
    await insertManual(`${FIXTURE_TAG.toLowerCase()}-manual-a`);
    await insertManual(`${FIXTURE_TAG.toLowerCase()}-manual-b`);
    const [manual] = await pool.query(
      'SELECT COUNT(*) AS n FROM dashboard_sections WHERE store_type = ? AND auto_kind IS NULL', [MODE]
    );
    expect(manual[0].n).toBe(2);
  });
});

// The clean-up the migration runs on production, where the copies already exist.
// It needs a table WITHOUT the new key to hold duplicates, so it works on a
// scratch copy of dashboard_sections (a real table — MySQL can't self-join a
// TEMPORARY one).
describeWithMysql('removing automatic rows that were already created twice', () => {
  const SCRATCH = `dashboard_sections_scratch_${FIXTURE_TAG.toLowerCase()}`;

  const addRow = async (slug, { kind = 'shop', sourceId, mode = 'sweets', deleted = false, active = 1 } = {}) => {
    const [result] = await pool.query(
      `INSERT INTO ${SCRATCH}
         (area_id, title, slug, section_type, store_type, active, display_order, auto_kind, auto_source_id, deleted_at, version)
       VALUES (1, ?, ?, 'product_block', ?, ?, 5, ?, ?, ?, 1)`,
      [slug, slug, mode, active, kind, sourceId, deleted ? new Date() : null]
    );
    return result.insertId;
  };
  const idsLeft = async () => (await pool.query(`SELECT id FROM ${SCRATCH} ORDER BY id`))[0].map((row) => row.id);

  beforeAll(async () => {
    await assertMysqlReady();
    await pool.query(`DROP TABLE IF EXISTS ${SCRATCH}`);
    await pool.query(`CREATE TABLE ${SCRATCH} LIKE dashboard_sections`);
    // Production's state before the fix: only the slug key, which lets copies in.
    await pool.query(`ALTER TABLE ${SCRATCH} DROP INDEX ${AUTO_SECTION_KEY_INDEX}`);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${SCRATCH}`);
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM ${SCRATCH}`);
  });

  it('keeps the first copy of each row and removes the rest', async () => {
    const a1 = await addRow('auto-shop-3-a', { sourceId: 3 });
    const a2 = await addRow('auto-shop-3-b', { sourceId: 3 });
    const b1 = await addRow('auto-category-9-a', { kind: 'category', sourceId: 9 });
    const b2 = await addRow('auto-category-9-b', { kind: 'category', sourceId: 9 });
    const b3 = await addRow('auto-category-9-c', { kind: 'category', sourceId: 9 });

    const removed = await removeDuplicateAutoSections(pool, SCRATCH);

    expect(removed).toBe(3);
    expect(await idsLeft()).toEqual([a1, b1]);
    expect([a2, b2, b3]).toHaveLength(3);
  });

  it('prefers the copy the admin still sees over one they deleted', async () => {
    await addRow('auto-shop-4-a', { sourceId: 4, deleted: true });
    const live = await addRow('auto-shop-4-b', { sourceId: 4 });

    await removeDuplicateAutoSections(pool, SCRATCH);

    expect(await idsLeft()).toEqual([live]);
  });

  it('prefers a copy customers can see over one that was switched off, so a visible row never disappears', async () => {
    await addRow('auto-shop-6-a', { sourceId: 6, active: 0 });
    const visible = await addRow('auto-shop-6-b', { sourceId: 6, active: 1 });
    await addRow('auto-shop-6-c', { sourceId: 6, active: 1 });
    await addRow('auto-shop-6-d', { sourceId: 6, deleted: true });

    await removeDuplicateAutoSections(pool, SCRATCH);

    expect(await idsLeft()).toEqual([visible]);
  });

  it('keeps a deleted row deleted when every copy was deleted', async () => {
    const first = await addRow('auto-shop-5-a', { sourceId: 5, deleted: true });
    await addRow('auto-shop-5-b', { sourceId: 5, deleted: true });

    await removeDuplicateAutoSections(pool, SCRATCH);

    expect(await idsLeft()).toEqual([first]);
  });

  it('does not merge rows of different shops, categories, or shop modes', async () => {
    await addRow('auto-shop-3-sweets', { sourceId: 3, mode: 'sweets' });
    await addRow('auto-shop-3-packed', { sourceId: 3, mode: 'packed' });
    await addRow('auto-category-3-sweets', { kind: 'category', sourceId: 3, mode: 'sweets' });
    await addRow('auto-shop-4-sweets', { sourceId: 4, mode: 'sweets' });

    expect(await removeDuplicateAutoSections(pool, SCRATCH)).toBe(0);
    expect(await idsLeft()).toHaveLength(4);
  });

  it("never touches the admin's own sections, even ones that share a slug", async () => {
    await pool.query(
      `INSERT INTO ${SCRATCH} (area_id, title, slug, section_type, store_type, active, display_order, version)
       VALUES (1, 'A', 'best-sellers', 'product_block', 'sweets', 1, 1, 1),
              (1, 'B', 'best-sellers', 'product_block', 'sweets', 1, 2, 1)`
    );

    expect(await removeDuplicateAutoSections(pool, SCRATCH)).toBe(0);
    expect(await idsLeft()).toHaveLength(2);
  });
});

// Top level, so it runs after both describes rather than after the first one.
afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
