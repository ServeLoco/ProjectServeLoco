/**
 * One-time backfill: copies the MongoDB `images` collection into the new
 * MySQL `images` table, then rewrites the 5 MySQL columns that reference
 * an image by the old Mongo ObjectId string so they point at the new
 * MySQL int id instead.
 *
 * NOT wired into `npm start` / migrate.js on purpose — this touches two
 * databases at once and must be run and verified by a human. Safe to
 * re-run any number of times (idempotent via legacy_mongo_id dedup).
 *
 * Usage (from apps/api):
 *   node scripts/backfillImagesToMysql.js --dry-run   # report only, no writes
 *   node scripts/backfillImagesToMysql.js             # copy + rewrite for real
 */

const mongodb = require('../src/db/mongodb');
const { pool } = require('../src/db/mysql');

const REFERENCING_COLUMNS = [
  { table: 'products', column: 'image_id' },
  { table: 'categories', column: 'image_id' },
  { table: 'combos', column: 'image_id' },
  { table: 'offers', column: 'image_id' },
  { table: 'settings', column: 'upi_qr_image_id' },
];

const dryRun = process.argv.includes('--dry-run');

const copyImagesToMysql = async (db) => {
  const docs = await db.collection('images').find().toArray();
  console.log(`[backfill] Mongo images collection has ${docs.length} document(s).`);

  let inserted = 0;
  let skipped = 0;

  for (const doc of docs) {
    const legacyId = doc._id.toString();

    const [existing] = await pool.query(
      'SELECT id FROM images WHERE legacy_mongo_id = ?',
      [legacyId]
    );
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const row = {
      filename: doc.filename || null,
      original_name: doc.originalName || null,
      mime_type: doc.mimeType || null,
      size: Number.isFinite(doc.size) ? doc.size : null,
      storage_type: doc.storageType === 's3' ? 's3' : 'disk',
      url: doc.url || null,
      alt_text: doc.altText || null,
      legacy_mongo_id: legacyId,
      created_at: doc.createdAt || new Date(),
      updated_at: doc.updatedAt || new Date(),
    };

    if (dryRun) {
      console.log(`[backfill] (dry-run) would insert image legacy_mongo_id=${legacyId} filename=${row.filename}`);
      inserted += 1;
      continue;
    }

    await pool.query(
      `INSERT INTO images
        (filename, original_name, mime_type, size, storage_type, url, alt_text, legacy_mongo_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.filename, row.original_name, row.mime_type, row.size, row.storage_type,
        row.url, row.alt_text, row.legacy_mongo_id, row.created_at, row.updated_at]
    );
    inserted += 1;
  }

  console.log(`[backfill] Images: ${inserted} inserted, ${skipped} already present (skipped).`);
};

const rewriteReferencingColumns = async () => {
  for (const { table, column } of REFERENCING_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT id, ${column} AS old_value FROM ${table} WHERE ${column} IS NOT NULL`
    );

    let rewritten = 0;
    let alreadyInt = 0;
    let noMatch = 0;

    for (const row of rows) {
      const oldValue = String(row.old_value);

      // Already migrated in a previous run (pure numeric string) — skip.
      if (/^\d+$/.test(oldValue)) {
        alreadyInt += 1;
        continue;
      }

      const [match] = await pool.query(
        'SELECT id FROM images WHERE legacy_mongo_id = ?',
        [oldValue]
      );
      if (match.length === 0) {
        noMatch += 1;
        console.warn(`[backfill] ${table}.${column}: no images row for legacy id ${oldValue} (row id=${row.id}) — leaving as-is`);
        continue;
      }

      const newId = match[0].id;
      if (dryRun) {
        console.log(`[backfill] (dry-run) would set ${table}.${column} = ${newId} for row id=${row.id} (was ${oldValue})`);
        rewritten += 1;
        continue;
      }

      await pool.query(
        `UPDATE ${table} SET ${column} = ? WHERE id = ?`,
        [String(newId), row.id]
      );
      rewritten += 1;
    }

    console.log(`[backfill] ${table}.${column}: ${rewritten} rewritten, ${alreadyInt} already migrated, ${noMatch} unmatched.`);
  }
};

const run = async () => {
  console.log(`[backfill] Starting${dryRun ? ' (DRY RUN — no writes)' : ''}...`);
  const db = await mongodb.connect();
  try {
    await copyImagesToMysql(db);
    await rewriteReferencingColumns();
    console.log('[backfill] Done.');
  } finally {
    await mongodb.close();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exitCode = 1;
});
