// One automatic Home row per shop/category, per area and shop mode — enforced by
// the database, not by hoping two requests never overlap.
//
// syncAutoSections creates a row the first time it sees a shop/category without
// one. Home and the admin App Home page both call it, so two requests landing
// together both saw "no row yet" and both inserted one; the slug key it relied
// on (area, mode, slug, deleted_at) never stopped them, because MySQL treats
// NULLs as different inside a unique key and a live row has deleted_at = NULL.
// This key covers exactly the columns that identify an automatic row. The
// admin's own sections have NULL auto_kind / auto_source_id, so they are outside
// it and can repeat titles or slugs as before.
const AUTO_SECTION_KEY_INDEX = 'uniq_dashboard_sections_auto_source';
const AUTO_SECTION_KEY_COLUMNS = 'area_id, store_type, auto_kind, auto_source_id';

// How much a copy should be kept: 0 = customers can see it, 1 = switched off,
// 2 = the admin deleted it. Lower wins.
const keepRank = (alias) =>
  `(CASE WHEN ${alias}.deleted_at IS NOT NULL THEN 2 WHEN ${alias}.active = 0 THEN 1 ELSE 0 END)`;

// Clears the copies the race already made, so the key above can be added on a
// database that has them. Of each set of copies it keeps the one customers can
// still see (a switched-off one loses to it, a deleted one loses to both), then
// the oldest; the rest are removed. An automatic row holds no items of its own,
// so nothing is lost with them. Returns how many rows it removed.
const removeDuplicateAutoSections = async (connection, table = 'dashboard_sections') => {
  const [result] = await connection.query(
    `DELETE d FROM ${table} d
       JOIN ${table} k
         ON k.area_id = d.area_id AND k.store_type = d.store_type
        AND k.auto_kind = d.auto_kind AND k.auto_source_id = d.auto_source_id
        AND k.id <> d.id
      WHERE d.auto_kind IS NOT NULL AND d.auto_source_id IS NOT NULL
        AND (
          ${keepRank('k')} < ${keepRank('d')}
          OR (${keepRank('k')} = ${keepRank('d')} AND k.id < d.id)
        )`
  );
  return Number(result?.affectedRows || 0);
};

module.exports = { AUTO_SECTION_KEY_INDEX, AUTO_SECTION_KEY_COLUMNS, removeDuplicateAutoSections };
