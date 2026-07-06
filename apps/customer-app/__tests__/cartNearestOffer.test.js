/**
 * Tests for the generalized "nearest unlockable offer" progress hint on the
 * cart screen, and the CouponSheet's locked/unlocked offer split.
 *
 * There is no @testing-library/react-native in this project (screen tests
 * elsewhere, e.g. HomeScreenBackExit.test.js, assert against the component
 * source instead of rendering) — these tests follow the same convention:
 * statically verify the wiring so behavior can't silently regress.
 */

const fs = require('fs');
const path = require('path');

const cartScreenPath = path.join(
  __dirname, '..', 'src', 'screens', 'customer', 'CartScreen', 'CartScreen.js'
);
const couponSheetPath = path.join(
  __dirname, '..', 'src', 'screens', 'customer', 'CartScreen', 'CouponSheet.js'
);

describe('CartScreen nearest-offer progress hint', () => {
  const source = fs.readFileSync(cartScreenPath, 'utf8');

  it('reads nearestOfferProgress from the normalized bill', () => {
    expect(source).toMatch(/const nearestOfferProgress = bill\?\.nearestOfferProgress \|\| null;/);
  });

  it('computes an animated progress percent from subtotal / minOrder, clamped 0-100', () => {
    const match = source.match(/const nearestOfferPercent = useMemo\(\(\) => \{([\s\S]*?)\}, \[nearestOfferProgress, bill\?\.subtotal\]\);/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/Math\.min\(100, Math\.max\(0, \(subtotal \/ minOrder\) \* 100\)\)/);
  });

  it('hides the hint entirely when there is no nearest offer', () => {
    expect(source).toMatch(/const renderNearestOfferHint = \(\) => \{\s*\n\s*if \(!nearestOfferProgress\) return null;/);
  });

  it('only renders the hint outside of loading/error states', () => {
    expect(source).toMatch(/\{!isCalculating && !calcError && renderNearestOfferHint\(\)\}/);
  });

  it('renders the hint below the bill summary and above the coupon card', () => {
    const billIdx = source.indexOf(': renderBillSummary()}');
    const hintIdx = source.indexOf('renderNearestOfferHint()');
    const couponIdx = source.indexOf('renderCouponCard()}');
    expect(billIdx).toBeGreaterThan(-1);
    expect(hintIdx).toBeGreaterThan(billIdx);
    expect(couponIdx).toBeGreaterThan(hintIdx);
  });

  it('tapping the hint opens the coupon sheet', () => {
    const match = source.match(/const renderNearestOfferHint = \(\) => \{[\s\S]*?onPress=\{\(\) => setShowCouponSheet\(true\)\}[\s\S]*?\};/);
    expect(match).not.toBeNull();
  });

  it('shows the amount-remaining + offer title copy via the shared hint helper', () => {
    expect(source).toMatch(/buildProgressHintText\(nearestOfferProgress, \{ suffix: ` to unlock \$\{nearestOfferProgress\.title\}` \}\)/);
  });

  it('only replays the entrance animation when the nearest offer actually changes (not on every recalculation)', () => {
    expect(source).toMatch(/const lastOfferHintKey = useRef\(null\);/);
    const match = source.match(/useEffect\(\(\) => \{\s*const key = nearestOfferProgress[\s\S]*?if \(key === lastOfferHintKey\.current\) return;/);
    expect(match).not.toBeNull();
  });

  it('animates opacity + translateY using native-driver-compatible motion tokens', () => {
    expect(source).toMatch(/import \{[^}]*motionConfig[^}]*entryDistance[^}]*\} from '..\/..\/..\/theme';/);
    expect(source).toMatch(/Animated\.timing\(offerHintAnim, \{ toValue: 1, \.\.\.motionConfig\.screen \}\)\.start\(\);/);
    expect(source).toMatch(/outputRange: \[entryDistance, 0\]/);
  });
});

describe('CouponSheet locked/unlocked offer split', () => {
  const source = fs.readFileSync(couponSheetPath, 'utf8');

  it('derives unlocked state from the backend flag, falling back to a client comparison', () => {
    const match = source.match(/const isUnlocked = useCallback\(\(coupon\) => \{([\s\S]*?)\}, \[subtotal\]\);/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/typeof coupon\.unlocked === 'boolean'/);
    expect(match[1]).toMatch(/subtotal >= Number\(coupon\.minOrder \|\| 0\)/);
  });

  it('splits coupons into unlockedCoupons, lockedCoupons, and unavailableCoupons — nothing is silently dropped (applied coupon excluded from all three; it gets its own section)', () => {
    expect(source).toMatch(/const isAvailable = useCallback\(\(coupon\) => coupon\.available !== false, \[\]\);/);
    expect(source).toMatch(/const unlockedCoupons = useMemo\(\s*\(\) => availableCoupons\.filter\(coupon => isAvailable\(coupon\) && isUnlocked\(coupon\) && !isAppliedCoupon\(coupon\)\),/);
    expect(source).toMatch(/const lockedCoupons = useMemo\(\s*\(\) => availableCoupons\.filter\(coupon => isAvailable\(coupon\) && !isUnlocked\(coupon\) && !isAppliedCoupon\(coupon\)\),/);
    expect(source).toMatch(/const unavailableCoupons = useMemo\(\s*\(\) => availableCoupons\.filter\(coupon => !isAvailable\(coupon\) && !isAppliedCoupon\(coupon\)\),/);
  });

  it('renders a "Not available" section for coupons the backend marks available:false, with the reason text', () => {
    const match = source.match(/\{unavailableCoupons\.map\(\(coupon\) => \(([\s\S]*?)\)\)\}/);
    expect(match).not.toBeNull();
    const block = match[1];
    expect(block).toMatch(/accessibilityState=\{\{ disabled: true \}\}/);
    expect(block).not.toMatch(/PressableScale/);
    expect(block).not.toMatch(/onPress/);
    expect(block).toMatch(/\{coupon\.unavailableReason \|\|/);
  });

  it('only ever taps/applies from unlockedCoupons — never silently applies a locked or manual coupon', () => {
    // onApplyCoupon is only invoked from two explicit user-initiated paths:
    // handleTapCoupon (tapping an unlocked coupon row) and handleApplyManualCode
    // (pressing "Apply" after typing a code in the manual-entry field).
    // Neither fires automatically.
    const applyCalls = source.match(/onApplyCoupon\(/g) || [];
    expect(applyCalls).toHaveLength(2);
    expect(source).toMatch(/const handleTapCoupon = useCallback\(\(coupon\) => \{\s*onApplyCoupon\(coupon\.code \|\| null, coupon\);/);
    expect(source).toMatch(/if \(result\?\.ok\) \{\s*onApplyCoupon\(result\.coupon\.code, result\.coupon\);/);

    // handleTapCoupon must only be wired inside the unlockedCoupons render
    // block — never inside lockedCoupons/unavailableCoupons — so a locked or
    // unavailable coupon can never be tapped to apply.
    const unlockedBlock = source.match(/\{unlockedCoupons\.map\(\(coupon\) => \{([\s\S]*?)\n\s*\}\)\}/);
    expect(unlockedBlock).not.toBeNull();
    expect(unlockedBlock[1]).toMatch(/onPress=\{\(\) => handleTapCoupon\(coupon\)\}/);

    const lockedBlock = source.match(/\{lockedCoupons\.map\(\(coupon\) => \{([\s\S]*?)\n\s*\}\)\}/);
    expect(lockedBlock).not.toBeNull();
    expect(lockedBlock[1]).not.toMatch(/handleTapCoupon/);
    expect(lockedBlock[1]).not.toMatch(/onPress/);
  });

  it('renders locked offers as non-interactive preview rows with a disabled accessibility state', () => {
    const match = source.match(/\{lockedCoupons\.map\(\(coupon\) => \{([\s\S]*?)\}\)\}/);
    expect(match).not.toBeNull();
    const block = match[1];
    expect(block).toMatch(/accessibilityState=\{\{ disabled: true \}\}/);
    // Locked rows use a plain View, not PressableScale — they must not be tappable/selectable.
    expect(block).not.toMatch(/PressableScale/);
    expect(block).not.toMatch(/onPress/);
  });

  it('shows an "Add ₹X more to unlock" caption on locked rows computed from server data', () => {
    expect(source).toMatch(/Add ₹\{remaining\} more to unlock/);
  });

  it('keeps the sheet API backward compatible (same props as before)', () => {
    expect(source).toMatch(/export default function CouponSheet\(\{\s*visible,\s*onClose,\s*subtotal,\s*availableCoupons = \[\],\s*appliedCoupon,\s*onApplyCoupon,\s*onRemoveCoupon,\s*\}\)/);
  });
});
