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

  it('reacts the moment a mode is tapped, with no fade-out wait', () => {
    const handler = homeSource.slice(homeSource.indexOf('const selectStoreType = useCallback'));
    const body = handler.slice(0, handler.indexOf('}, [storeType, sectionsFade]);'));
    expect(body).toMatch(/setStoreType\(val\);/);
    // The old handler waited for a 110ms fade-out before swapping.
    expect(body).not.toMatch(/toValue: 0/);
    expect(body).toMatch(/sectionsFade\.setValue\(0\.4\);/);
  });

  it('only redraws Home sections when the fetched data actually changed', () => {
    expect(homeSource).toMatch(/JSON\.stringify\(previous\) === JSON\.stringify\(sectionsData\)/);
  });

  it('keeps product cards memoised and their handlers stable across cart changes', () => {
    expect(homeSource).toMatch(/const HomeProductCard = React\.memo\(/);
    expect(homeSource).toMatch(/section\.items\.map\(normalizeProductCached\)/);
    // Handlers read the cart at tap time; depending on `items` would rebuild
    // them (and re-render every card) on each add.
    expect(homeSource).toMatch(/\}, \[requireAuth, addCombo, addItem\]\);/);
    expect(homeSource).toMatch(/\}, \[decrementCombo, removeItem, updateQuantity\]\);/);
  });

  it('draws Home sections a few at a time, lower ones only as the customer nears them', () => {
    expect(homeSource).toMatch(/const SECTIONS_INITIAL = 2;/);
    expect(homeSource).toMatch(/orderedUnits\.slice\(0, renderedSectionCount\)\.map\(/);
    // The next section is drawn once the drawn ones end within a screen of the view's bottom.
    expect(homeSource).toMatch(/offset \+ viewport \* 2 < content/);
    expect(homeSource).toMatch(/count \+ 1/);
    // A new mode starts from the top again.
    const handler = homeSource.slice(homeSource.indexOf('const selectStoreType = useCallback'));
    expect(handler.slice(0, 900)).toMatch(/setRenderedSectionCount\(SECTIONS_INITIAL\)/);
  });

  it('retries a failed first load on its own instead of waiting for a pull to refresh', () => {
    expect(homeSource).toMatch(/const DASHBOARD_RETRY_DELAYS_MS = \[1500, 3000, 5000, 8000, 12000\];/);
    expect(homeSource).toMatch(/dashboardFailuresRef\.current >= DASHBOARD_FAILURES_BEFORE_ERROR/);
    expect(homeSource).toMatch(/retryDashboardLoadSoon\(\);/);
    // Connection coming back retries at once.
    expect(homeSource).toMatch(/addNetInfoListener\(\(state\) =>/);
  });

  it('lets the first tap on Buy through when the keyboard is open', () => {
    expect(homeSource).toMatch(/keyboardShouldPersistTaps="handled"\n\s+refreshControl=/);
  });

  it('keeps the header and capsule up on a post-first-load fetch', () => {
    expect(homeSource).toMatch(/const isSectionsLoading = isLoading && hasLoadedOnce;/);
    expect(homeSource).toMatch(/setHasLoadedOnce\(true\);/);
  });

  it('refetches a catalog.updated push (admin price edit) within a fraction of a second', () => {
    expect(homeSource).toMatch(/const CATALOG_REFETCH_JITTER_MS = 300;/);
    expect(homeSource).toMatch(/'catalog\.updated' \? CATALOG_REFETCH_JITTER_MS/);
  });

  it('always loads a mode fresh — no data reused from an earlier visit or a background prefetch', () => {
    const handler = homeSource.slice(homeSource.indexOf('const selectStoreType = useCallback'));
    const body = handler.slice(0, handler.indexOf('}, [storeType, sectionsFade]);'));
    expect(body).toMatch(/delete sectionsCacheRef\.current\[val\];/);
    expect(body).toMatch(/setDashboardSections\(\[\]\);/);
    expect(homeSource).not.toMatch(/prefetchedModesRef/);
    expect(homeSource).not.toMatch(/dropOtherModeCaches/);
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
    expect(productListSource).toMatch(/Math\.random\(\) \* 300\)/);
  });
});

describe('Home loading skeleton', () => {
  it('is built from the real sections\' sizes with explicit heights, and has no padding of its own', () => {
    // Explicit heights: LoadingSkeleton's default height would beat an aspectRatio.
    expect(homeSource).toMatch(/categoryHeight: Math\.round\(categoryWidth \/ 0\.9\)/);
    expect(homeSource).toMatch(/productHeight: Math\.round\(productWidth \/ 0\.82\)/);
    expect(homeSource).toMatch(/bannerHeight: Math\.round\(\(contentWidth \* 8\) \/ 16\)/);
    expect(homeSource).toMatch(/skeletonContainer: \{\n {4}flex: 1,\n {2}\},/);
    expect(homeSource).not.toMatch(/aspectRatio: 0\.9,\n {4}borderRadius: radius\.lg,\n {2}\},\n {2}categoryScroll/);
  });
});

describe('Home offer banner corners', () => {
  it('rounds one clip around the whole strip, not each banner, so corners stay round mid-slide', () => {
    expect(homeSource).toMatch(/offerCarouselClip: \{\n {4}borderRadius: 18,\n {4}overflow: 'hidden',/);
    expect(homeSource).toMatch(/<View style=\{\[styles\.offerCarouselClip, \{ width: bannerWidth \}\]\}>/);
    expect(homeSource).toMatch(/offerBanner: \{\n {4}overflow: 'hidden',/);
  });

  it('drives the dots only from the scroll position, so they never snap or flicker', () => {
    // An `activeIndex === index ? 1 : opacity` override made the new dot jump
    // to full while the old one dropped, before the strip had even moved.
    expect(homeSource).not.toMatch(/activeIndex === index/);
    expect(homeSource).toMatch(/const activeIndexRef = useRef\(0\);/);
  });

  it('cuts back to the first banner instead of whipping the strip past every banner', () => {
    expect(homeSource).toMatch(/animated: nextIndex !== 0/);
  });
});

describe('Home automatic rows (shops, then categories)', () => {
  it('draws automatic rows as ordinary sections in the admin\'s order, 8 items each by default, See all opens the shop or category', () => {
    expect(homeSource).toMatch(/const AUTO_BLOCK_LIMIT = 8;/);
    expect(homeSource).toMatch(/const AutoProductBlock = React\.memo\(/);
    // The row's own "max display items" setting drives the limit.
    expect(homeSource).toMatch(/const limit = Number\(auto\.maxVisibleItems\) > 0/);
    // A shop row loads by shop, a category row by category.
    expect(homeSource).toMatch(/auto\.autoKind === 'shop' \? \{ shopId: auto\.sourceId \} : \{ categoryId: auto\.sourceId \}/);
    expect(homeSource).toMatch(/orderedUnits\.slice\(0, renderedSectionCount\)\.map\(unit => \{/);
    expect(homeSource).toMatch(/onSeeAll=\{handleAutoSeeAll\}/);
    expect(homeSource).toMatch(/shopId: auto\.sourceId, sectionTitle: auto\.title/);
    expect(homeSource).not.toMatch(/seeAllCategoriesRow/);
    expect(homeSource).not.toMatch(/label="See all categories"/);
  });

  it('gets them from the dashboard sections (same list and order as the admin), never its own fetch', () => {
    expect(homeSource).toMatch(/orderHomeUnits\(dashboardSections\)/);
    expect(homeSource).not.toMatch(/productsApi\.getCategories/);
    expect(homeSource).not.toMatch(/autoSections/);
    expect(homeSource).toMatch(/setAutoBlocksRefresh\(\(n\) => n \+ 1\);/);
  });

  it('refetches them at once on an availability or shop change', () => {
    const availability = homeSource.slice(homeSource.indexOf('subscribeProductAvailabilityEvents(({ payload })'));
    expect(availability.slice(0, 700)).toMatch(/setAutoBlocksRefresh\(\(n\) => n \+ 1\);/);
    const shop = homeSource.slice(homeSource.indexOf("if (eventName === 'shop.status.updated')") - 250);
    expect(shop.slice(0, 350)).toMatch(/setAutoBlocksRefresh\(\(n\) => n \+ 1\);/);
  });

  it('draws them one at a time with the admin sections', () => {
    expect(homeSource).toMatch(/const totalDrawUnits = orderedUnits\.length;/);
  });
});

describe('Home puts sections with only unavailable items last', () => {
  it('draws the units in the order homeSectionOrder gives (behaviour is covered in homeSectionOrder.test.js)', () => {
    expect(homeSource).toMatch(/const orderedUnits = useMemo\(\(\) => orderHomeUnits\(dashboardSections\), \[dashboardSections\]\);/);
  });

  it('takes the answer for automatic rows from the server, so the page never reshuffles after rows load', () => {
    const orderSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'homeSectionOrder.js'), 'utf8');
    expect(orderSource).toMatch(/\? Boolean\(section\.allUnavailable\)/);
    // No client-side reporting/reordering once a row has loaded.
    expect(homeSource).not.toMatch(/unavailableAutoIds/);
    expect(homeSource).not.toMatch(/onAvailability/);
    // Sellable items first, so a row's few shown items never hide an available one.
    expect(homeSource).toMatch(/availableFirst: 1,/);
  });
});

describe('Home fills in top to bottom', () => {
  it('a row shows its content only after every automatic row above it has, holding a same-size skeleton until then', () => {
    expect(homeSource).toMatch(/const revealed = Boolean\(loaded\) && canReveal !== false;/);
    expect(homeSource).toMatch(/let rowsAboveRevealed = true;/);
    expect(homeSource).toMatch(/if \(!loadedAutoIds\[auto\.id\]\) rowsAboveRevealed = false;/);
    expect(homeSource).toMatch(/canReveal=\{canReveal\}/);
    expect(homeSource).toMatch(/onLoaded=\{handleAutoLoaded\}/);
  });

  it('a manual section below a row that is still loading waits behind a skeleton (strictly top to bottom)', () => {
    expect(homeSource).toMatch(/if \(!rowsAboveRevealed\) \{/);
  });

  it('draws the rows\' skeletons together (one frame apart), not one by one', () => {
    expect(homeSource).toMatch(/setTimeout\(drawMoreIfNeeded, 16\)/);
  });
});
