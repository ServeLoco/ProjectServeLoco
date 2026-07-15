/**
 * Live free-delivery progress for StickyMiniCart.
 */
const {
  liveFreeDeliveryProgress,
  freeDeliveryUnlockPercent,
  isFreeDeliveryUnlocked,
} = require('../src/utils/freeDeliveryProgress');

describe('liveFreeDeliveryProgress', () => {
  it('returns null when no stored progress', () => {
    expect(liveFreeDeliveryProgress(null, 100, 2)).toBeNull();
  });

  it('recomputes amountRemaining from live subtotal', () => {
    const live = liveFreeDeliveryProgress(
      { minOrder: 149, amountRemaining: 50, minItemCount: 0, itemsRemaining: 0 },
      100,
      1,
    );
    expect(live.amountRemaining).toBe(49);
    expect(live.minOrder).toBe(149);
  });

  it('returns null when subtotal meets minOrder (unlocked)', () => {
    expect(liveFreeDeliveryProgress(
      { minOrder: 149, amountRemaining: 10, minItemCount: 0, itemsRemaining: 0 },
      149,
      2,
    )).toBeNull();
  });

  it('recomputes itemsRemaining for item_count thresholds', () => {
    const live = liveFreeDeliveryProgress(
      { minOrder: 0, amountRemaining: 0, minItemCount: 3, itemsRemaining: 2, thresholdType: 'item_count' },
      50,
      1,
    );
    expect(live.itemsRemaining).toBe(2);
    expect(live.thresholdType).toBe('item_count');
  });
});

describe('freeDeliveryUnlockPercent', () => {
  it('is subtotal / minOrder * 100', () => {
    expect(freeDeliveryUnlockPercent(
      { minOrder: 200, amountRemaining: 50 },
      150,
      1,
    )).toBe(75);
  });

  it('is 100 when progress is null (unlocked)', () => {
    expect(freeDeliveryUnlockPercent(null, 200, 3)).toBe(100);
  });

  it('uses item count when minOrder is 0', () => {
    expect(freeDeliveryUnlockPercent(
      { minOrder: 0, minItemCount: 4 },
      0,
      2,
    )).toBe(50);
  });
});

describe('isFreeDeliveryUnlocked', () => {
  it('is true when flag is set', () => {
    expect(isFreeDeliveryUnlocked(null, null, true)).toBe(true);
  });

  it('is true when stored threshold met and live is null', () => {
    expect(isFreeDeliveryUnlocked(
      { minOrder: 149, amountRemaining: 0 },
      null,
      false,
    )).toBe(true);
  });

  it('is false when still remaining', () => {
    const live = { minOrder: 149, amountRemaining: 20 };
    expect(isFreeDeliveryUnlocked(
      { minOrder: 149, amountRemaining: 20 },
      live,
      false,
    )).toBe(false);
  });
});

describe('StickyMiniCart free-delivery wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'StickyMiniCart', 'StickyMiniCart.js'),
    'utf8',
  );

  it('uses live recompute helpers and renders an in-pill progress track', () => {
    expect(source).toMatch(/liveFreeDeliveryProgress/);
    expect(source).toMatch(/freeDeliveryUnlockPercent/);
    expect(source).toMatch(/progressTrack/);
    expect(source).toMatch(/for FREE delivery/);
    expect(source).toMatch(/Free delivery unlocked/);
  });
});

describe('useSyncCartFreeDeliveryProgress is mounted for authenticated customer shell', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'navigation', 'CustomerNavigator.js'),
    'utf8',
  );

  it('calls useSyncCartFreeDeliveryProgress when authenticated', () => {
    expect(source).toMatch(/useSyncCartFreeDeliveryProgress\(\{\s*enabled: isAuthenticated\s*\}\)/);
  });
});
