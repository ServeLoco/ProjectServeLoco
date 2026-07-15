/**
 * Tests for the cart unlock progress ladder (free delivery first, then
 * nearest discount offer) and the CouponSheet's locked/unlocked offer split.
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

describe('CartScreen unified unlock progress', () => {
  const source = fs.readFileSync(cartScreenPath, 'utf8');

  it('reads freeDeliveryProgress and nearestOfferProgress from the normalized bill', () => {
    expect(source).toMatch(/const freeDeliveryProgress = bill\?\.freeDeliveryProgress \|\| null;/);
    expect(source).toMatch(/const nearestOfferProgress = bill\?\.nearestOfferProgress \|\| null;/);
  });

  it('builds a single unlockProgress that prefers free delivery over nearest offer', () => {
    expect(source).toMatch(/const unlockProgress = useMemo\(\(\) => \{/);
    expect(source).toMatch(/if \(freeDeliveryProgress\) \{/);
    expect(source).toMatch(/kind: 'free_delivery'/);
    expect(source).toMatch(/if \(nearestOfferProgress\) \{/);
    expect(source).toMatch(/kind: 'offer'/);
  });

  it('computes unlock percent from subtotal / minOrder, clamped 0-100', () => {
    const match = source.match(/const unlockPercent = useMemo\(\(\) => \{([\s\S]*?)\}, \[unlockProgress, bill\?\.subtotal\]\);/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/Math\.min\(100, Math\.max\(0, \(subtotal \/ minOrder\) \* 100\)\)/);
  });

  it('renders unlock progress inside bill summary, not as a separate box below it', () => {
    expect(source).toMatch(/unlockProgress \? renderUnlockProgress\(\)/);
    expect(source).not.toMatch(/renderNearestOfferHint/);
    expect(source).not.toMatch(/nearestOfferBox/);
  });

  it('uses the same animated bar copy pattern for free delivery and discount offers', () => {
    expect(source).toMatch(/to unlock \$\{unlockLabel\}/);
    expect(source).toMatch(/title: 'free delivery'/);
    expect(source).toMatch(/title: nearestOfferProgress\.title \|\| 'offer'/);
  });

  it('only replays entrance when the unlock goal itself changes', () => {
    expect(source).toMatch(/const lastFreeDeliveryGoalKey = useRef\(null\);/);
    expect(source).toMatch(/\$\{unlockProgress\.kind\}:\$\{unlockProgress\.title\}:\$\{unlockProgress\.minOrder\}/);
  });

  it('animates bar width + entrance with motion tokens', () => {
    expect(source).toMatch(/import \{[^}]*motionConfig[^}]*entryDistance[^}]*\} from '..\/..\/..\/theme';/);
    expect(source).toMatch(/Animated\.spring\(freeDeliveryAnim,/);
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
