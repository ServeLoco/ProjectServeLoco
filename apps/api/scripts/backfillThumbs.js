/**
 * Manual backfill: generate WebP thumb_url for images that lack one.
 * Works for STORAGE_DRIVER=disk and s3.
 *
 *   APP_ENV=development node scripts/backfillThumbs.js
 *   APP_ENV=production  node scripts/backfillThumbs.js
 *
 * NOT run by migrate.js. Safe to re-run.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

process.env.APP_ENV = process.env.APP_ENV || 'development';

const { pool } = require('../src/db/mysql');
const config = require('../src/config/env');
const s3 = require('../src/config/s3');
const { generateThumb, thumbFilenameFor } = require('../src/utils/imageThumbs');

const BATCH = 25;
const uploadDir = path.join(__dirname, '../', config.UPLOAD_DIR);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function loadOriginalBuffer(row) {
  if (row.storage_type === 'disk') {
    const filePath = path.join(uploadDir, row.filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`disk file missing: ${filePath}`);
    }
    return fs.readFileSync(filePath);
  }
  if (!row.url) throw new Error('no url for s3 image');
  return fetchUrl(row.url);
}

async function processRow(row) {
  const buffer = await loadOriginalBuffer(row);
  const thumb = await generateThumb(buffer);
  if (!thumb) throw new Error('generateThumb returned null');

  const thumbFilename = thumbFilenameFor(row.filename, thumb.ext);
  let thumbUrl;
  if (row.storage_type === 's3') {
    thumbUrl = await s3.uploadBuffer(thumbFilename, thumb.buffer, thumb.mimeType);
  } else {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, thumbFilename), thumb.buffer);
    thumbUrl = `${config.PUBLIC_BASE_URL}${config.STATIC_UPLOAD_PATH}/${thumbFilename}`;
  }

  await pool.query('UPDATE images SET thumb_url = ? WHERE id = ?', [thumbUrl, row.id]);
  return thumbUrl;
}

async function main() {
  console.log(`[backfillThumbs] STORAGE_DRIVER=${config.STORAGE_DRIVER} APP_ENV=${process.env.APP_ENV}`);
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) AS total FROM images WHERE thumb_url IS NULL OR thumb_url = ''"
  );
  console.log(`[backfillThumbs] ${total} image(s) need thumbs`);

  let done = 0;
  let failed = 0;
  let afterId = 0;

  while (true) {
    const [rows] = await pool.query(
      `SELECT id, filename, url, storage_type, mime_type
       FROM images
       WHERE (thumb_url IS NULL OR thumb_url = '') AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
      [afterId, BATCH]
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        await processRow(row);
        done += 1;
        console.log(`[backfillThumbs] ok id=${row.id} (${done}/${total}, failed=${failed})`);
      } catch (err) {
        failed += 1;
        console.error(`[backfillThumbs] FAIL id=${row.id}: ${err.message}`);
      }
      afterId = row.id;
    }
  }

  console.log(`[backfillThumbs] complete. ok=${done} failed=${failed}`);
  if (typeof pool.end === 'function') await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[backfillThumbs] fatal', err);
  process.exit(1);
});
