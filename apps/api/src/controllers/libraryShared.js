// Shared by categoryLibraryController.js and storeModeLibraryController.js
// (TASK 26) — same requireOneArea shape libraryController.js already had
// for product-library add-to-area, extracted here so it isn't triplicated.
const { requestAreaId } = require('../utils/areaScope');
const { pool } = require('../db/mysql');

// add-to-area targets exactly one area — an area_admin's own (resolveAdminArea
// already pins that), or a super_admin's explicit X-Area-Id. Never 'all': a
// single add-to-area call materializing into every area at once would be a
// bulk fan-out endpoint's job, not this one's.
const requireOneArea = (req, res) => {
  const areaId = requestAreaId(req);
  if (areaId === null) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'X-Area-Id is required for this action' });
    return null;
  }
  if (areaId === 'all') {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'This action cannot target "all" areas at once' });
    return null;
  }
  return areaId;
};

// GET /api/images/:id returns image metadata JSON, not the binary — so
// `<img src="/api/images/{id}">` (what the Library page's list rows used
// to build client-side) always renders a broken image. The three library
// tables only store the images.id FK, so every list endpoint here must
// resolve it to the real images.url before it reaches the client (bug fix:
// Library page images never rendered).
const attachImageUrls = async (rows, { idField, urlField, snakeUrlField }) => {
  const ids = [...new Set(rows.map((r) => r[idField]).filter((id) => id != null))];
  if (ids.length === 0) return rows;
  const [images] = await pool.query('SELECT id, url FROM images WHERE id IN (?)', [ids]);
  const urlById = new Map(images.map((img) => [String(img.id), img.url]));
  for (const row of rows) {
    const url = row[idField] != null ? (urlById.get(String(row[idField])) || null) : null;
    row[urlField] = url;
    row[snakeUrlField] = url;
  }
  return rows;
};

module.exports = { requireOneArea, attachImageUrls };
