/**
 * One-time cleanup: merge product_library rows that share the exact same
 * name (case/whitespace-insensitive) into a single canonical entry.
 *
 * Why this exists: backfillProductLibrary.js / migrate.js's auto-backfill
 * promote every area's own product into ITS OWN library row — by design
 * (plans/multi-area.md, TASK 18, "Decision reversed 2026-08-06") they never
 * merge, because guessing which of several similarly-named products is
 * "the same" can't be done safely from name alone in general. This script
 * takes the narrower, explicit bet the user asked for: two active library
 * rows with an identical name ARE the same product. That is a real risk on
 * a generic name (e.g. "Soap") shared by two unrelated products in
 * different areas — read the dry-run report before applying.
 *
 * Usage:
 *   APP_ENV=development node scripts/dedupeProductLibrary.js            # dry run, no writes
 *   APP_ENV=development node scripts/dedupeProductLibrary.js --apply    # actually merge
 *
 * What "merge" does, per duplicate group (same normalized name):
 *   - Canonical = the group's oldest row (lowest id).
 *   - Every other row in the group: every area `products` row pointing at
 *     it is re-linked to the canonical id instead. Each of that product's
 *     variants is re-linked to the canonical's matching-label
 *     library_variant (created on the canonical if no matching label
 *     exists yet) so no variant is ever left dangling.
 *   - The duplicate product_library row is ARCHIVED, never deleted — same
 *     as the existing "Archive" action in the admin Library page. Nothing
 *     about any area's own product row (name, price, category, shop,
 *     availability) is touched; only which library row it points to.
 *   - Runs one group per transaction, FOR UPDATE-locked, so a concurrent
 *     admin edit can't race a merge in progress.
 */
require('dotenv').config();
process.env.APP_ENV = process.env.APP_ENV || 'development';

const APPLY = process.argv.includes('--apply');

const { pool } = require('../src/db/mysql');
const { bustAreaCaches } = require('../src/utils/areaScope');

const normalizeName = (name) => String(name || '').trim().toLowerCase();

async function main() {
  console.log(`[dedupeProductLibrary] APP_ENV=${process.env.APP_ENV} mode=${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`);

  const [rows] = await pool.query(
    'SELECT id, name FROM product_library WHERE archived = 0 ORDER BY id ASC'
  );

  const groups = new Map();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`[dedupeProductLibrary] ${rows.length} active library row(s), ${duplicateGroups.length} duplicate name group(s)`);

  let mergedGroups = 0;
  let mergedRows = 0;
  let mergedProducts = 0;
  let failed = 0;

  for (const group of duplicateGroups) {
    const [canonical, ...duplicates] = group;
    console.log(`\n[dedupeProductLibrary] "${canonical.name}" -> keep library id=${canonical.id}, merge ids=[${duplicates.map((d) => d.id).join(', ')}]`);

    if (!APPLY) {
      for (const dup of duplicates) {
        const [products] = await pool.query(
          'SELECT id, area_id FROM products WHERE library_product_id = ? AND deleted = 0',
          [dup.id]
        );
        console.log(`  would move ${products.length} product(s) from library id=${dup.id} -> ${canonical.id} (areas: ${[...new Set(products.map((p) => p.area_id))].join(', ') || 'none'})`);
      }
      continue;
    }

    const connection = await pool.getConnection();
    const affectedAreaIds = new Set();
    try {
      await connection.beginTransaction();

      const lockIds = [canonical.id, ...duplicates.map((d) => d.id)];
      await connection.query('SELECT id FROM product_library WHERE id IN (?) FOR UPDATE', [lockIds]);

      const [canonicalVariants] = await connection.query(
        'SELECT id, label FROM library_variants WHERE library_product_id = ?',
        [canonical.id]
      );
      const canonicalVariantByLabel = new Map(
        canonicalVariants.map((v) => [normalizeName(v.label), v.id])
      );
      let nextDisplayOrder = canonicalVariants.length;

      for (const dup of duplicates) {
        const [products] = await connection.query(
          'SELECT id, area_id FROM products WHERE library_product_id = ? AND deleted = 0 FOR UPDATE',
          [dup.id]
        );

        for (const product of products) {
          const [variants] = await connection.query(
            'SELECT id, library_variant_id, label FROM product_variants WHERE product_id = ? AND deleted = 0',
            [product.id]
          );
          for (const variant of variants) {
            if (!variant.label) continue;
            const key = normalizeName(variant.label);
            let canonicalVariantId = canonicalVariantByLabel.get(key);
            if (!canonicalVariantId) {
              const [ins] = await connection.query(
                'INSERT INTO library_variants (library_product_id, label, display_order, is_default) VALUES (?, ?, ?, 0)',
                [canonical.id, variant.label, nextDisplayOrder]
              );
              nextDisplayOrder += 1;
              canonicalVariantId = ins.insertId;
              canonicalVariantByLabel.set(key, canonicalVariantId);
            }
            await connection.query(
              'UPDATE product_variants SET library_variant_id = ? WHERE id = ?',
              [canonicalVariantId, variant.id]
            );
          }

          await connection.query('UPDATE products SET library_product_id = ? WHERE id = ?', [canonical.id, product.id]);
          affectedAreaIds.add(product.area_id);
          mergedProducts += 1;
        }

        await connection.query('UPDATE product_library SET archived = 1 WHERE id = ?', [dup.id]);
        mergedRows += 1;
      }

      await connection.commit();
      mergedGroups += 1;
      console.log(`  merged. areas touched: ${[...affectedAreaIds].join(', ') || 'none'}`);
    } catch (err) {
      await connection.rollback();
      failed += 1;
      console.error(`  FAILED to merge group "${canonical.name}": ${err.message}`);
    } finally {
      connection.release();
    }

    if (APPLY) {
      await Promise.all([...affectedAreaIds].map((areaId) => bustAreaCaches(areaId))).catch((err) =>
        console.error('[dedupeProductLibrary] cache bust failed:', err.message)
      );
    }
  }

  console.log(`\n[dedupeProductLibrary] complete. groups=${mergedGroups} duplicateRowsArchived=${mergedRows} productsRelinked=${mergedProducts} failed=${failed}`);
  if (!APPLY) console.log('[dedupeProductLibrary] dry run only — re-run with --apply to write these changes.');
  if (typeof pool.end === 'function') await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[dedupeProductLibrary] fatal', err);
  process.exit(1);
});
