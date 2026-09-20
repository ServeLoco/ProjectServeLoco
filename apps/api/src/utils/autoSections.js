const { pool } = require('../db/mysql');
const logger = require('./logger');

/**
 * Rows Home creates by itself: one per shop that sells something in a shop
 * mode (its name, then its items) and one per category of that mode (its
 * name, then its items). They are stored as ordinary dashboard_sections rows
 * (auto_kind 'shop' | 'category', auto_source_id = the shop/category id) so the
 * admin App Home page lists them with everything else and can reorder, hide or
 * time them exactly like a manual section — the only difference is the "auto"
 * label. Their ITEMS are never stored: the customer app loads each row's first
 * items when it is scrolled to (GET /products?shopId= / ?categoryId=).
 *
 * syncAutoSections keeps the rows in step with reality:
 *   - a shop/category with products in the mode but no row yet gets one, placed
 *     after everything already there (shops first, then categories);
 *   - a row's title follows its shop/category name;
 *   - a row whose shop/category no longer qualifies is left in place but not
 *     returned as valid (so it disappears from Home and the admin list, and
 *     comes back in its old position if the source returns);
 *   - a row the admin deleted stays deleted (never re-created).
 */
const AUTO_ITEM_LIMIT = 8;

const keyOf = (kind, sourceId) => `${kind}:${Number(sourceId)}`;

// What SHOULD exist for this mode, in display order: shops, then categories.
const getAutoSectionSources = async (areaId, storeType) => {
  const [shops] = await pool.query(
    `SELECT s.id, s.name
     FROM shops s
     WHERE s.area_id = ? AND s.active = 1
       AND EXISTS (
         SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id
         WHERE p.shop_id = s.id AND p.deleted = 0 AND p.is_combo = 0 AND p.area_id = s.area_id
           AND c.deleted = 0 AND c.active = 1 AND c.type = ?
       )
     ORDER BY s.name ASC, s.id ASC`,
    [areaId, storeType]
  );

  const [categories] = await pool.query(
    `SELECT c.id, c.name
     FROM categories c
     WHERE c.area_id = ? AND c.active = 1 AND c.deleted = 0 AND c.type = ?
       AND EXISTS (
         SELECT 1 FROM products p
         WHERE p.category_id = c.id AND p.deleted = 0 AND p.is_combo = 0 AND p.area_id = c.area_id
       )
     ORDER BY c.display_order ASC, c.id ASC`,
    [areaId, storeType]
  );

  return [
    ...shops.map((shop) => ({ kind: 'shop', sourceId: Number(shop.id), title: shop.name })),
    ...categories.map((category) => ({ kind: 'category', sourceId: Number(category.id), title: category.name })),
  ];
};

/**
 * Creates/updates the auto rows for one shop mode. Returns the Set of
 * `kind:sourceId` keys that are valid right now — callers hide any auto row
 * not in it. Never throws (returns an empty Set): a failure here must not
 * break Home or the admin page.
 */
const syncAutoSections = async (areaId, storeType) => {
  const valid = new Set();
  if (!storeType || storeType === 'all') return valid;

  try {
    const sources = await getAutoSectionSources(areaId, storeType);
    if (sources.length === 0) return valid;
    sources.forEach((source) => valid.add(keyOf(source.kind, source.sourceId)));

    const [existing] = await pool.query(
      `SELECT id, auto_kind, auto_source_id, title, deleted_at
       FROM dashboard_sections
       WHERE area_id = ? AND store_type = ? AND auto_kind IS NOT NULL`,
      [areaId, storeType]
    );
    const byKey = new Map(existing.map((row) => [keyOf(row.auto_kind, row.auto_source_id), row]));

    const missing = sources.filter((source) => !byKey.has(keyOf(source.kind, source.sourceId)));
    if (missing.length > 0) {
      const [orderRows] = await pool.query(
        `SELECT COALESCE(MAX(display_order), -1) AS max_order
         FROM dashboard_sections
         WHERE area_id = ? AND deleted_at IS NULL AND (store_type = ? OR store_type = 'all')`,
        [areaId, storeType]
      );
      let nextOrder = Number(orderRows[0]?.max_order ?? -1) + 1;
      for (const source of missing) {
        const slug = `auto-${source.kind}-${source.sourceId}`;
        // INSERT IGNORE: two requests syncing at once must not fail on the
        // (area, mode, slug) unique key — the loser just skips.
        await pool.query(
          `INSERT IGNORE INTO dashboard_sections
             (area_id, title, slug, section_type, store_type, active, display_order,
              max_visible_items, show_see_all, show_hot_badge, section_icon,
              auto_kind, auto_source_id, version)
           VALUES (?, ?, ?, 'product_block', ?, 1, ?, ?, 0, 0, NULL, ?, ?, 1)`,
          [areaId, source.title, slug, storeType, nextOrder, AUTO_ITEM_LIMIT, source.kind, source.sourceId]
        );
        nextOrder += 1;
      }
    }

    // Titles follow the shop/category name (skipping rows the admin deleted).
    for (const source of sources) {
      const row = byKey.get(keyOf(source.kind, source.sourceId));
      if (row && !row.deleted_at && row.title !== source.title) {
        await pool.query('UPDATE dashboard_sections SET title = ? WHERE id = ? AND area_id = ?', [source.title, row.id, areaId]);
      }
    }
  } catch (error) {
    logger.error('[autoSections] sync failed:', error.message);
    return new Set();
  }
  return valid;
};

// Is this dashboard_sections row shown? Manual rows always; auto rows only
// while their shop/category still qualifies.
const isAutoRowVisible = (row, validKeys) =>
  !row.auto_kind || validKeys.has(keyOf(row.auto_kind, row.auto_source_id));

module.exports = { syncAutoSections, getAutoSectionSources, isAutoRowVisible, AUTO_ITEM_LIMIT };
