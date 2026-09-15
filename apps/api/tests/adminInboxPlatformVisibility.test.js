/**
 * Two contracts that make platform-level notifications work, both easy to
 * undo by accident:
 *
 *  1. The migration must leave admin_notifications.area_id NULLABLE. Three
 *     steps exist specifically to guarantee a concrete area, and every one
 *     of them would destroy a platform row — the backfill would rewrite it
 *     to Area 1 on the next boot, silently handing that team every new
 *     customer's name and phone.
 *  2. The inbox reads already give the right visibility for free, and it
 *     hangs entirely on "all" dropping the area clause.
 */
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');
const migrateSource = read('db', 'migrate.js');
const adminSource = read('controllers', 'adminController.js');
const authSource = read('controllers', 'authController.js');

describe('platform-level admin notifications — migration', () => {
  it('keeps admin_notifications out of the area-guaranteeing steps', () => {
    expect(migrateSource).toMatch(
      /const PLATFORM_NULLABLE_AREA_TABLES = new Set\(\['admin_notifications'\]\);/
    );
    // Backfill, orphan assert and NOT NULL all run over the filtered list.
    const strictLoops = migrateSource.match(/for \(const tableName of STRICT_AREA_TABLES\)/g) || [];
    expect(strictLoops).toHaveLength(3);
  });

  it('re-widens the column on a database an earlier run already tightened', () => {
    expect(migrateSource).toMatch(
      /IS_NULLABLE === 'NO'[\s\S]{0,200}MODIFY COLUMN area_id INT NULL/
    );
  });

  // The column must still be created, and the FK still applies (MySQL does
  // not check a NULL child) — only the three strict steps are skipped.
  it('still creates the column and the foreign key for every scoped table', () => {
    expect(migrateSource).toMatch(
      /for \(const tableName of AREA_SCOPED_TABLES\) \{\s*\n\s*await ensureColumnAtEnd\(tableName, 'area_id'/
    );
    expect(migrateSource).toMatch(
      /for \(const tableName of AREA_SCOPED_TABLES\) \{\s*\n\s*await ensureForeignKey\(/
    );
  });
});

describe('platform-level admin notifications — inbox visibility', () => {
  // 'all' drops the clause entirely, so NULL rows are returned; a specific
  // area filters `area_id = ?`, which a NULL never matches. Both halves are
  // load-bearing: a future "COALESCE(area_id, ...)" or an IS NULL OR branch
  // in the scoped clause would leak platform rows into one team's inbox.
  it("shows platform rows in 'all' and hides them from a single area", () => {
    const clauses = adminSource.match(
      /const areaClause = areaId === 'all' \? '' : ' AND area_id = \?';/g
    ) || [];
    expect(clauses.length).toBeGreaterThan(0);
  });
});

describe('signup notification', () => {
  it('is platform-level, not attributed to a default area', () => {
    expect(authSource).toMatch(/areaId: null,/);
    expect(authSource).not.toMatch(/signupAreaId/);
    expect(authSource).not.toMatch(/getDefaultArea/);
  });
});
