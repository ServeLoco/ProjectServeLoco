/**
 * Tests for the Home screen's category_grid dashboard section.
 *
 * The admin panel lets you set `max_visible_items` per dashboard section
 * (default 6 for category_grid). The API already caps `section.items` at
 * that value and echoes `maxVisibleItems` on the section response.
 *
 * The customer app used to hard-code `.slice(0, 4)` for the category
 * rail, which silently truncated to 4 even when the admin assigned 6 or
 * more categories. These tests guard against any re-introduction of a
 * fixed client-side cap.
 */

const fs = require('fs');
const path = require('path');

const homeScreenPath = path.join(
  __dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'
);

describe('HomeScreen category_grid section honors admin max_visible_items', () => {
  const source = fs.readFileSync(homeScreenPath, 'utf8');

  // Locate the category_grid branch so the assertions below only
  // inspect code that applies to that section (the screen also handles
  // offer_banner / product_block / combo_block with their own logic).
  const branchMatch = source.match(
    /section\.sectionType\s*===\s*['"]category_grid['"][\s\S]*?if\s*\(\s*section\.sectionType\s*===/
  );
  const branch = branchMatch ? branchMatch[0] : source;

  it('does NOT hard-code a fixed client-side slice (e.g. slice(0, 4))', () => {
    // The original bug: `normalizedItems.slice(0, 4)` ignored the admin
    // setting. Guard against any future re-introduction of a literal cap.
    expect(branch).not.toMatch(/slice\(\s*0\s*,\s*\d+\s*\)/);
  });

  it('reads maxVisibleItems off the section payload', () => {
    // The fix sources the cap from the API response. The exact form
    // may be `section.maxVisibleItems` or `Number(section.maxVisibleItems)`,
    // so accept either.
    expect(branch).toMatch(/section\.maxVisibleItems/);
  });

  it('slices normalizedItems by a dynamic max, not a literal', () => {
    // Whatever local variable holds the cap, it must be used as the
    // upper bound of the slice — never a literal number.
    const sliceCall = branch.match(/normalizedItems\.slice\(\s*0\s*,\s*([^)]+)\)/);
    expect(sliceCall).not.toBeNull();
    const bound = sliceCall[1].trim();
    expect(bound).not.toMatch(/^\d+$/);
    expect(bound.length).toBeGreaterThan(0);
  });

  it('still computes a `hasMore` signal for the See-all pill', () => {
    // Without hasMore, users with > maxVisibleItems categories would
    // never see a See-all button. The fallback chain must remain.
    expect(branch).toMatch(/section\.hasMore\s*===\s*true/);
    expect(branch).toMatch(/hasMore\s*=/);
  });
});

describe('API dashboardController already caps items at max_visible_items', () => {
  const controllerPath = path.join(
    __dirname, '..', '..', 'api', 'src', 'controllers', 'dashboardController.js'
  );
  const source = fs.readFileSync(controllerPath, 'utf8');

  it('slices the section response items to max_visible_items', () => {
    // Server-side defence in depth: the response must already respect
    // the admin cap so clients that ignore it still see the right count.
    expect(source).toMatch(/section\.max_visible_items\s*\|\|\s*\d+/);
  });

  it('emits maxVisibleItems on the section payload', () => {
    // The customer app reads `section.maxVisibleItems` — the API must
    // ship that camelCase field on every section.
    expect(source).toMatch(/maxVisibleItems:\s*section\.max_visible_items/);
  });

  it('flags hasMore when more items exist than fit in the cap', () => {
    expect(source).toMatch(/hasMore:\s*totalItems\s*>\s*visibleItems\.length/);
  });
});
