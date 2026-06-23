/**
 * Tests for the Home screen's back-press exit confirmation.
 *
 * Without the guard, pressing the hardware back button from the Home
 * tab finishes the activity and exits the app — surprising and easy to
 * trigger by accident. The screen should intercept the back press,
 * show a modern confirmation modal branded "VillKro", and only exit
 * on explicit confirmation.
 *
 * These tests statically assert the HomeScreen file has the right
 * wiring (BackHandler listener + ExitAppModal + exitApp call) so the
 * behavior can't silently regress.
 */

const fs = require('fs');
const path = require('path');

const homeScreenPath = path.join(
  __dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'
);

describe('HomeScreen back-press exit confirmation', () => {
  const source = fs.readFileSync(homeScreenPath, 'utf8');

  it('imports BackHandler from react-native', () => {
    expect(source).toMatch(/import\s*\{[^}]*\bBackHandler\b[^}]*\}\s*from\s*'react-native'/);
  });

  it('imports ExitAppModal', () => {
    const hasDirect = /from\s*['"][^'"]*ExitAppModal['"]/.test(source);
    const hasBarrel = /import\s*\{[^}]*\bExitAppModal\b[^}]*\}\s*from\s*['"][^'"]*components['"]/.test(source);
    expect(hasDirect || hasBarrel).toBe(true);
  });

  it('has an isExitModalOpen state', () => {
    expect(source).toMatch(/isExitModalOpen/);
  });

  it('registers a hardwareBackPress handler inside useFocusEffect', () => {
    expect(source).toMatch(/useFocusEffect\s*\([\s\S]*?BackHandler\.addEventListener\(\s*'hardwareBackPress'/);
  });

  it('handler returns true to consume the press (prevents default exit)', () => {
    const match = source.match(/onBackPress\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\}/);
    expect(match).not.toBeNull();
    if (match) {
      const body = match[1];
      expect(body).toMatch(/setIsExitModalOpen\s*\(\s*true\s*\)/);
      expect(body).toMatch(/return\s+true\s*;?/);
    }
  });

  it('cleanup removes the BackHandler subscription', () => {
    expect(source).toMatch(/return\s*\(\s*\)\s*=>\s*sub\.remove\(\)\s*;?/);
  });

  it('renders ExitAppModal wired to exit the app on confirm', () => {
    expect(source).toMatch(/<ExitAppModal[\s\S]*?onExit=\{[\s\S]*?BackHandler\.exitApp\(\)[\s\S]*?\}\s*\/>/);
    expect(source).toMatch(/<ExitAppModal[\s\S]*?onStay=\{[\s\S]*?setIsExitModalOpen\(false\)[\s\S]*?\}\s*\/>/);
  });

  it('does NOT use the old ServeLoco title', () => {
    // Belt-and-suspenders: the user reported the brand name was wrong.
    // This guards against any future re-introduction.
    expect(source).not.toMatch(/Exit ServeLoco\?/);
  });
});

describe('ExitAppModal component', () => {
  const modalSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'ExitAppModal', 'ExitAppModal.js'),
    'utf8'
  );

  it('brands the modal as VillKro', () => {
    expect(modalSource).toMatch(/Exit VillKro\?/);
  });

  it('does NOT include a logo (minimal design)', () => {
    // User asked for a minimal popup — no logo. Guard against future
    // re-introduction.
    expect(modalSource).not.toMatch(/Image\s+source\s*=\s*\{\s*(?:dashboardLogo|require\([^)]*Images)/);
    expect(modalSource).not.toMatch(/brandWrap/);
    expect(modalSource).not.toMatch(/brandLogo/);
  });

  it('has Stay and Exit buttons', () => {
    expect(modalSource).toMatch(/accessibilityLabel="Stay in app"/);
    expect(modalSource).toMatch(/accessibilityLabel="Exit app"/);
  });

  it('is a functional component with visible/cartItemCount/onStay/onExit props', () => {
    expect(modalSource).toMatch(/function\s+ExitAppModal\s*\(\s*\{\s*visible\s*,\s*cartItemCount\s*=\s*0\s*,\s*onStay\s*,\s*onExit\s*\}/);
  });

  it('adapts subtitle to cart state (no false promises when cart is empty)', () => {
    // The component must NOT hard-code "Your cart will be here…" because
    // it would lie to users with empty carts. It must branch on the
    // count so an empty cart shows a neutral message.
    expect(modalSource).toMatch(/Number\(cartItemCount\)\s*>\s*0/);
    expect(modalSource).toMatch(/Your cart will be here when you come back\./);
    expect(modalSource).toMatch(/You can come back anytime\./);
  });

  it('exports default', () => {
    expect(modalSource).toMatch(/export\s+default\s+ExitAppModal/);
  });
});

describe('HomeScreen passes cartItemCount to ExitAppModal', () => {
  const homeSource = fs.readFileSync(homeScreenPath, 'utf8');

  it('passes cartItemCount so subtitle adapts to cart state', () => {
    expect(homeSource).toMatch(/<ExitAppModal[\s\S]*?cartItemCount=\{cartItemCount\}[\s\S]*?\/>/);
  });
});