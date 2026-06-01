const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db/mongodb');
const { pool } = require('../db/mysql');
const config = require('../config/env');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

const UPLOAD_DIR = path.join(__dirname, '../../', config.UPLOAD_DIR);
const MAX_IMAGE_BYTES = parseInt(config.MAX_IMAGE_SIZE_MB || '5') * 1024 * 1024;

/** Verify a buffer starts with ZIP magic bytes PK\x03\x04 */
const isValidZip = (buffer) => buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;

/** Detect image type from magic bytes */
const detectImageType = (buffer) => {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'webp';
  return null;
};

const MIME_MAP = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Parse CSV or XLSX buffer → array of row objects */
const parseSpreadsheet = (buffer, mimetype, originalname) => {
  const ext = path.extname(originalname || '').toLowerCase();
  const isXlsx = ext === '.xlsx' || ext === '.xls' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel';

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  // CSV
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
};

/** Build a unique filename for a saved image */
const buildFilename = (originalFilename) => {
  const ext = path.extname(originalFilename);
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return `image-${uniqueSuffix}${ext}`;
};

/** Write image buffer to disk, return saved filename */
const saveImageToDisk = (buffer, originalFilename) => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = buildFilename(originalFilename);
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filename;
};

/** Delete a disk file safely (no throw) */
const safeDeleteFile = (filename) => {
  if (!filename) return;
  try {
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('[bulkImport] Failed to delete file:', filename, e.message);
  }
};

/** Delete a list of newly saved files (rollback helper) */
const cleanupFiles = (filenames) => {
  for (const f of filenames) safeDeleteFile(f);
};

// ─────────────────────────────────────────────
// Core validation
// ─────────────────────────────────────────────

/**
 * Validate all rows against category list and ZIP contents.
 * Returns { errors: [], rows: [] }
 * Each row has: { rowNum, name, price, category_id, unit, image_file, ...optional, _action: 'create'|'update' }
 */
const validateRows = async (rawRows, zipEntryMap, categoryMap) => {
  const errors = [];
  const validatedRows = [];
  const seenImageFiles = new Map(); // filename → rowNum (duplicate check)
  const seenNameCategory = new Map(); // `${name}::${cat}` → rowNum (duplicate within CSV)

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // +2 because row 1 is header
    const rowErrors = [];

    // ── Required: name
    const name = String(raw.name || '').trim();
    if (!name) rowErrors.push('name is required');

    // ── Required: price
    const priceRaw = String(raw.price || '').trim();
    const price = parseFloat(priceRaw);
    if (!priceRaw || isNaN(price) || price < 0) rowErrors.push('price must be a valid non-negative number');

    // ── Required: category_id
    const categoryIdRaw = String(raw.category_id || '').trim();
    const categoryId = parseInt(categoryIdRaw, 10);
    let categoryValid = false;
    if (!categoryIdRaw || isNaN(categoryId)) {
      rowErrors.push('category_id is required');
    } else if (!categoryMap[categoryId]) {
      rowErrors.push(`category_id ${categoryId} not found`);
    } else {
      categoryValid = true;
    }

    // ── Required: image_file
    const imageFile = String(raw.image_file || '').trim();
    if (!imageFile) {
      rowErrors.push('image_file is required');
    } else {
      // Check duplicate image filename within the CSV
      if (seenImageFiles.has(imageFile)) {
        rowErrors.push(`duplicate image_file "${imageFile}" — first used at row ${seenImageFiles.get(imageFile)}`);
      } else {
        seenImageFiles.set(imageFile, rowNum);
      }
      // Check image exists in ZIP
      if (!zipEntryMap[imageFile]) {
        rowErrors.push(`"${imageFile}" not found in the ZIP file`);
      } else {
        // Decompress once — cache on the entry object to avoid double decompression
        if (!zipEntryMap[imageFile]._cachedData) {
          zipEntryMap[imageFile]._cachedData = zipEntryMap[imageFile].getData();
        }
        const buf = zipEntryMap[imageFile]._cachedData;
        if (buf.length > MAX_IMAGE_BYTES) {
          rowErrors.push(`"${imageFile}" exceeds the ${config.MAX_IMAGE_SIZE_MB || 5} MB size limit`);
        } else if (!detectImageType(buf)) {
          rowErrors.push(`"${imageFile}" is not a valid image (JPG, PNG, or WebP required)`);
        }
      }
    }

    // ── Optional: original_price
    let originalPrice = null;
    if (raw.original_price !== undefined && String(raw.original_price).trim() !== '') {
      originalPrice = parseFloat(String(raw.original_price).trim());
      if (isNaN(originalPrice)) {
        rowErrors.push('original_price must be a valid number');
        originalPrice = null;
      } else if (!isNaN(price) && originalPrice < price) {
        rowErrors.push('original_price cannot be less than price');
        originalPrice = null;
      }
    }

    // ── Optional booleans
    const parseBool = (val, defaultVal) => {
      if (val === undefined || String(val).trim() === '') return defaultVal;
      const s = String(val).trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes';
    };

    const available = parseBool(raw.available, true);
    const featured = parseBool(raw.featured, false);
    const displayOrder = raw.display_order !== undefined && String(raw.display_order).trim() !== ''
      ? Math.max(0, parseInt(String(raw.display_order).trim(), 10) || 0)
      : 0;
    const discountLabel = String(raw.discount_label || '').trim() || null;
    const description = String(raw.description || '').trim() || '';
    const unit = String(raw.unit || '').trim();
    if (!unit) rowErrors.push('unit is required (e.g. 500ml, 1 Plate, 52g)');

    // ── Duplicate name+category check within CSV
    const nameKey = `${name.toLowerCase()}::${categoryId}`;
    if (name && categoryValid && seenNameCategory.has(nameKey)) {
      rowErrors.push(`duplicate name+category combination — first at row ${seenNameCategory.get(nameKey)}`);
    } else if (name && categoryValid) {
      seenNameCategory.set(nameKey, rowNum);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    } else {
      validatedRows.push({
        rowNum,
        name,
        price,
        category_id: categoryId,
        unit,
        description,
        image_file: imageFile,
        available,
        featured,
        display_order: displayOrder,
        original_price: originalPrice,
        discount_label: discountLabel,
      });
    }
  }

  return { errors, validatedRows };
};

// ─────────────────────────────────────────────
// Shared parse + validate logic (used by both preview and commit)
// ─────────────────────────────────────────────

const parseAndValidate = async (req) => {
  const csvFile = req.files?.csvFile?.[0];
  const zipFile = req.files?.imagesZip?.[0];

  if (!csvFile) throw { status: 400, message: 'csvFile is required (CSV or XLSX)' };
  if (!zipFile) throw { status: 400, message: 'imagesZip is required (ZIP of product images)' };

  // Parse spreadsheet
  let rawRows;
  try {
    rawRows = parseSpreadsheet(csvFile.buffer, csvFile.mimetype, csvFile.originalname);
  } catch (e) {
    throw { status: 422, message: `Failed to parse spreadsheet: ${e.message}` };
  }

  if (!rawRows || rawRows.length === 0) {
    throw { status: 422, message: 'The spreadsheet contains no data rows.' };
  }

  // Validate ZIP magic bytes before attempting to parse
  if (!isValidZip(zipFile.buffer)) {
    throw { status: 422, message: 'imagesZip is not a valid ZIP file.' };
  }

  // Parse ZIP → map: filename → AdmZip entry
  let zipEntryMap;
  try {
    const zip = new AdmZip(zipFile.buffer);
    zipEntryMap = {};
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      // Strip any folder prefix from the ZIP path — use only basename
      const basename = path.basename(entry.entryName);
      zipEntryMap[basename] = entry;
    }
  } catch (e) {
    throw { status: 422, message: `Failed to read ZIP file: ${e.message}` };
  }

  // Load categories from DB
  const [catRows] = await pool.query('SELECT id, name, type FROM categories WHERE deleted = 0');
  const categoryMap = {};
  for (const c of catRows) categoryMap[c.id] = c;

  // Validate
  const { errors, validatedRows } = await validateRows(rawRows, zipEntryMap, categoryMap);

  // Check which rows are create vs update
  for (const row of validatedRows) {
    const [existing] = await pool.query(
      'SELECT id, image_id FROM products WHERE name = ? AND category_id = ? AND deleted = 0 LIMIT 1',
      [row.name, row.category_id]
    );
    if (existing.length > 0) {
      row._action = 'update';
      row._existingId = existing[0].id;
      row._existingImageId = existing[0].image_id || null;
    } else {
      row._action = 'create';
    }
  }

  return { rawRows, validatedRows, errors, zipEntryMap, categoryMap };
};

// ─────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────

/**
 * POST /api/admin/products/bulk-import?preview=true
 * Validates without writing anything.
 */
const previewBulkImport = async (req, res) => {
  try {
    const { rawRows, validatedRows, errors } = await parseAndValidate(req);

    const createCount = validatedRows.filter(r => r._action === 'create').length;
    const updateCount = validatedRows.filter(r => r._action === 'update').length;

    return res.status(200).json({
      preview: true,
      summary: {
        total: rawRows.length,
        valid: validatedRows.length,
        will_create: createCount,
        will_update: updateCount,
        error_count: errors.length,
      },
      rows: validatedRows.map(r => ({
        row: r.rowNum,
        name: r.name,
        price: r.price,
        category_id: r.category_id,
        unit: r.unit,
        image_file: r.image_file,
        action: r._action,
      })),
      errors,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ code: 'VALIDATION_ERROR', message: err.message });
    }
    console.error('[bulkImport] preview error:', err);
    return res.status(500).json({ code: 'SERVER_ERROR', message: GENERIC_ERROR });
  }
};

/**
 * POST /api/admin/products/bulk-import
 * Validates and commits. All-or-nothing.
 */
const commitBulkImport = async (req, res) => {
  const savedFiles = []; // track newly written files for rollback
  let connection;

  try {
    const { validatedRows, errors, zipEntryMap } = await parseAndValidate(req);

    // Any validation error → reject entirely
    if (errors.length > 0) {
      return res.status(422).json({
        code: 'VALIDATION_ERROR',
        message: `Import failed: ${errors.length} row(s) have errors. Fix them and try again.`,
        errors,
      });
    }

    const db = getDb();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let created = 0;
    let updated = 0;

    for (const row of validatedRows) {
      // 1. Get image bytes from ZIP — use cached buffer from validation if available
      const imgEntry = zipEntryMap[row.image_file];
      const imgBuffer = imgEntry._cachedData || imgEntry.getData();
      const imgType = detectImageType(imgBuffer);
      const mimetype = MIME_MAP[imgType] || 'image/jpeg';

      // 2. Save image file to disk
      const savedFilename = saveImageToDisk(imgBuffer, row.image_file);
      savedFiles.push(savedFilename);

      // 3. If updating: delete the old image (disk + MongoDB)
      if (row._action === 'update' && row._existingImageId) {
        try {
          const oldDoc = await db.collection('images').findOne({ _id: new ObjectId(row._existingImageId) });
          if (oldDoc) {
            safeDeleteFile(oldDoc.filename);
            await db.collection('images').deleteOne({ _id: new ObjectId(row._existingImageId) });
          }
        } catch (e) {
          console.error('[bulkImport] Failed to clean up old image:', row._existingImageId, e.message);
          // Non-fatal — continue with the new image
        }
      }

      // 4. Insert new MongoDB images doc
      const baseUrl = config.PUBLIC_BASE_URL;
      const staticPath = config.STATIC_UPLOAD_PATH;
      const imageUrl = `${baseUrl}${staticPath}/${savedFilename}`;

      const imageDoc = {
        filename: savedFilename,
        originalName: path.basename(row.image_file).replace(/[^a-zA-Z0-9._-]/g, ''),
        mimeType: mimetype,
        size: imgBuffer.length,
        storageType: 'disk',
        url: imageUrl,
        altText: row.name,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertResult = await db.collection('images').insertOne(imageDoc);
      const newImageId = insertResult.insertedId.toString();

      // 5. INSERT or UPDATE product in MySQL
      if (row._action === 'create') {
        await connection.query(
          `INSERT INTO products
            (name, price, category_id, unit, description, image_id, available, is_combo, featured, display_order, original_price, discount_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.name, row.price, row.category_id, row.unit, row.description,
            newImageId, row.available ? 1 : 0, 0, row.featured ? 1 : 0,
            row.display_order, row.original_price, row.discount_label,
          ]
        );
        created++;
      } else {
        await connection.query(
          `UPDATE products SET
            name = ?, price = ?, category_id = ?, unit = ?, description = ?,
            image_id = ?, available = ?, featured = ?, display_order = ?,
            original_price = ?, discount_label = ?
           WHERE id = ? AND deleted = 0`,
          [
            row.name, row.price, row.category_id, row.unit, row.description,
            newImageId, row.available ? 1 : 0, row.featured ? 1 : 0,
            row.display_order, row.original_price, row.discount_label,
            row._existingId,
          ]
        );
        updated++;
      }
    }

    await connection.commit();
    connection.release();

    return res.status(201).json({
      message: 'Bulk import completed successfully.',
      created,
      updated,
      failed: 0,
      errors: [],
    });

  } catch (err) {
    // Rollback MySQL transaction
    if (connection) {
      try { await connection.rollback(); } catch (e) { /* ignore */ }
      try { connection.release(); } catch (e) { /* ignore */ }
    }
    // Clean up newly saved image files
    cleanupFiles(savedFiles);

    if (err.status) {
      return res.status(err.status).json({ code: 'VALIDATION_ERROR', message: err.message });
    }
    console.error('[bulkImport] commit error:', err);
    return res.status(500).json({ code: 'SERVER_ERROR', message: GENERIC_ERROR });
  }
};

module.exports = { previewBulkImport, commitBulkImport };
