/**
 * Tests for admin-controlled section header rendering on HomeScreen.
 *
 * Admins can set `show_hot_badge` and `section_icon` per dashboard section.
 * The customer app must read these from the API response and render them
 * accordingly, with safe defaults when they're absent.
 *
 * Uses static-source assertions so the wiring cannot silently regress.
 */

const fs = require('fs');
const path = require('path');

const homeScreenPath = path.join(
  __dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'
);

describe('HomeScreen reads admin-controlled show_hot_badge and section_icon', () => {
  const source = fs.readFileSync(homeScreenPath, 'utf8');

  it('reads showHotBadge from the section payload', () => {
    expect(source).toMatch(/section\.showHotBadge\s*===\s*true/);
  });

  it('renders the HOT badge only when showHotBadge is true (no combo hard-code)', () => {
    // The admin toggle is the sole source of truth: combo blocks must not
    // force the badge on, so admins can turn it off per section.
    expect(source).toMatch(/\{section\.showHotBadge\s*===\s*true\s*&&/);
    expect(source).not.toMatch(/isComboBlock\s*\|\|\s*section\.showHotBadge/);
  });

  it('reads sectionIcon from the section payload', () => {
    expect(source).toMatch(/section\.sectionIcon/);
  });

  it('falls back to section-type default icon when sectionIcon is absent', () => {
    expect(source).toMatch(/!section\.sectionIcon\s*&&\s*section\.sectionType\s*===\s*['"]category_grid['"]/);
    expect(source).toMatch(/!section\.sectionIcon\s*&&\s*section\.sectionType\s*===\s*['"]product_block['"]/);
  });

  it('renders the chosen icon via AppIcon when sectionIcon is provided', () => {
    expect(source).toMatch(/section\.sectionIcon\s*===\s*['"]box['"]/);
    expect(source).toMatch(/section\.sectionIcon\s*===\s*['"]shoppingBag['"]/);
    expect(source).toMatch(/section\.sectionIcon\s*===\s*['"]star['"]/);
  });
});
