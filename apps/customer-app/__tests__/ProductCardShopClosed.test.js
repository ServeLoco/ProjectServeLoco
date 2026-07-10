/**
 * Tests for the ProductCard closed-shop treatment.
 *
 * When a product's shop is closed (shopIsOpen === false) the card must
 * still show the product photo and name, but the photo is desaturated,
 * a "Shop closed" label is overlaid just above the vertical center, and
 * the buy control / outer press are locked.
 *
 * These tests use static source assertions (no React render) so they run
 * fast and cannot silently regress when someone refactors the card.
 */

const fs = require('fs');
const path = require('path');

const productCardPath = path.join(
  __dirname, '..', 'src', 'components', 'ProductCard', 'ProductCard.js'
);
const productImagePath = path.join(
  __dirname, '..', 'src', 'components', 'ProductImage', 'ProductImage.js'
);

describe('ProductCard renders closed-shop products as disabled', () => {
  const source = fs.readFileSync(productCardPath, 'utf8');

  it('derives an isShopClosed flag from both shopIsOpen casings', () => {
    expect(source).toMatch(/isShopClosed\s*=/);
    expect(source).toMatch(/shopIsOpen/);
    expect(source).toMatch(/shop_is_open/);
  });

  it('does not treat shop-closed as the same unavailable state as out-of-stock', () => {
    // The closed branch must exist separately from the existing "Out" branch
    // so the control can render "Closed" rather than "Out".
    expect(source).toMatch(/key=["']closed["']/);
    expect(source).toMatch(/key=["']out["']/);
  });

  it('shows a disabled "Closed" pill before the generic "Out" pill', () => {
    const closedBranch = source.match(/key=["']closed["'][\s\S]{0,200}Closed/);
    expect(closedBranch).not.toBeNull();
    expect(source.indexOf('key="closed"')).toBeLessThan(source.indexOf('key="out"'));
  });

  it('disables the outer TouchableOpacity when the shop is closed', () => {
    expect(source).toMatch(/disabled=\{isShopClosed\}/);
  });

  it('strips press handlers when the shop is closed', () => {
    expect(source).toMatch(/onPress=\{isShopClosed \? null : onPress\}/);
    expect(source).toMatch(/onPressIn=\{isShopClosed \? null : handlePressIn\}/);
    expect(source).toMatch(/onPressOut=\{isShopClosed \? null : handlePressOut\}/);
  });

  it('passes a grayscale filter to the product image when closed', () => {
    expect(source).toMatch(/filter=\{isShopClosed \? \[\{ grayscale: 1 \}\] : undefined\}/);
  });

  it('overlays a semi-transparent white wash when the shop is closed', () => {
    expect(source).toMatch(/closedWash/);
    expect(source).toMatch(/rgba\(255,255,255,0\.45\)/);
  });

  it('renders a "Shop closed" label near the vertical center of the card', () => {
    expect(source).toMatch(/Shop closed/);
    expect(source).toMatch(/top:\s*['"]38%['"]/);
  });

  it('hides the discount ribbon when the shop is closed', () => {
    expect(source).toMatch(/!isShopClosed/);
  });
});

describe('ProductImage forwards the filter prop to expo-image', () => {
  const source = fs.readFileSync(productImagePath, 'utf8');

  it('accepts a filter prop in the function signature', () => {
    expect(source).toMatch(/filter,?\s*\n?\}\s*\)\s*\{/);
    expect(source).toMatch(/function ProductImage\([\s\S]*?\bfilter\b/);
  });

  it('passes filter to both fallback and remote Image components', () => {
    const filterMatches = source.match(/filter=\{filter\}/g);
    expect(filterMatches).not.toBeNull();
    expect(filterMatches.length).toBeGreaterThanOrEqual(2);
  });
});
