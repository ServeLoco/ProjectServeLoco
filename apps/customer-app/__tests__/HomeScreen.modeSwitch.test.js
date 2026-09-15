const fs = require('fs');
const path = require('path');

const homeSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'),
  'utf8',
);
const realtimeSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'api', 'realtimeClient.js'),
  'utf8',
);
const productListSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'ProductListScreen', 'ProductListScreen.js'),
  'utf8',
);

// Source-level guards, same style as HomeScreen.locationLoading.test.js —
// this screen has no render harness in this suite.
describe('Home store-mode switching', () => {
  it('crossfades the sections block, not the mode capsule', () => {
    expect(homeSource).toMatch(/const sectionsFade = useRef\(new Animated\.Value\(1\)\)\.current;/);
    // The capsule lives above this wrapper, so it must not be inside it.
    const wrapperIndex = homeSource.indexOf('<Animated.View style={{ opacity: sectionsFade }}>');
    const capsuleIndex = homeSource.indexOf('<SegmentedControl');
    expect(wrapperIndex).toBeGreaterThan(-1);
    expect(capsuleIndex).toBeGreaterThan(-1);
    expect(capsuleIndex).toBeLessThan(wrapperIndex);
  });

  it('drops an interrupted fade instead of applying a mode the user moved past', () => {
    expect(homeSource).toMatch(/\.start\(\(\{ finished \}\) => \{[\s\S]{0,400}?if \(!finished\) return;/);
  });

  it('keeps the header and capsule up on a post-first-load fetch', () => {
    expect(homeSource).toMatch(/const isSectionsLoading = isLoading && hasLoadedOnce;/);
    expect(homeSource).toMatch(/setHasLoadedOnce\(true\);/);
  });

  it('re-warms the other modes after a live event drops their cache', () => {
    // Both containers are refs; without the counter the prefetch effect
    // never re-runs and the dropped modes stay cold.
    expect(homeSource).toMatch(/setCacheGeneration\(gen => gen \+ 1\);/);
    expect(homeSource).toMatch(/prefetchSectionImages, cacheGeneration\]\);/);
  });

  it('tells the customer why the skeleton is still up on a weak link', () => {
    expect(homeSource).toMatch(/Slow internet — still loading items…/);
  });
});

describe('catalog.updated', () => {
  it('rides the existing shop-event path and busts the dashboard stamp', () => {
    expect(realtimeSource).toMatch(/'catalog\.updated',/);
    const shopBlock = realtimeSource.slice(realtimeSource.indexOf('SHOP_EVENTS.forEach'));
    expect(shopBlock).toMatch(/invalidate\('dashboard:'\)/);
  });

  it('revalidates the product list in place, keeping loaded pages', () => {
    expect(productListSource).toMatch(/eventName === 'catalog\.updated'/);
    expect(productListSource).toMatch(/fetchProductsRef\.current\?\.\(\{ silent: true \}\)/);
  });
});
