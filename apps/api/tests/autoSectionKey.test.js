/**
 * The one-row-per-shop/category guarantee for Home's automatic rows. The real
 * behaviour (overlapping syncs, the clean-up on a table that holds copies) is
 * proven against MySQL in tests/integration/autoSectionsConcurrency.test.js;
 * this file guards the wiring that needs no database.
 */
const fs = require('fs');
const path = require('path');
const {
  AUTO_SECTION_KEY_INDEX, AUTO_SECTION_KEY_COLUMNS, removeDuplicateAutoSections,
} = require('../src/db/autoSectionKey');

describe('removeDuplicateAutoSections', () => {
  it('returns how many copies it removed', async () => {
    const connection = { query: jest.fn().mockResolvedValue([{ affectedRows: 20 }]) };
    await expect(removeDuplicateAutoSections(connection)).resolves.toBe(20);
  });

  it('only ever looks at automatic rows, so the admin\'s own sections are never removed', async () => {
    const connection = { query: jest.fn().mockResolvedValue([{ affectedRows: 0 }]) };
    await removeDuplicateAutoSections(connection);
    const [sql] = connection.query.mock.calls[0];
    expect(sql).toMatch(/DELETE d FROM dashboard_sections d/);
    expect(sql).toMatch(/d\.auto_kind IS NOT NULL AND d\.auto_source_id IS NOT NULL/);
    // copies are the same area, mode, kind AND source — never a match across them
    for (const column of ['area_id', 'store_type', 'auto_kind', 'auto_source_id']) {
      expect(sql).toContain(`k.${column} = d.${column}`);
    }
  });
});

describe('migrate.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/db/migrate.js'), 'utf8');

  it('clears existing copies BEFORE adding the key (the key cannot be added over copies)', () => {
    const cleanUp = source.indexOf('await removeDuplicateAutoSections(connection)');
    const addKey = source.indexOf('ensureUniqueIndex(\'dashboard_sections\', AUTO_SECTION_KEY_INDEX');
    expect(cleanUp).toBeGreaterThan(-1);
    expect(addKey).toBeGreaterThan(cleanUp);
  });

  it('keys automatic rows by area, mode, kind and source id — the columns that identify one', () => {
    expect(AUTO_SECTION_KEY_COLUMNS).toBe('area_id, store_type, auto_kind, auto_source_id');
    expect(AUTO_SECTION_KEY_INDEX).toBe('uniq_dashboard_sections_auto_source');
  });
});
