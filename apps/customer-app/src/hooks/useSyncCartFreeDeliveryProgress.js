import { useEffect, useRef } from 'react';
import { cartApi } from '../api/cartApi';
import { useCartStore } from '../stores';
import { normalizeCartCalculation } from '../utils';

/**
 * Keeps free-delivery progress on the cart store in sync whenever items
 * change (Home / ProductList / Categories sticky pill), not only when the
 * user opens Cart or Checkout.
 *
 * Debounced cart/calculate; sequence-guarded so rapid +/− doesn't apply stale
 * responses. Failures are silent — the pill falls back to last-known progress
 * + live recompute from local subtotal.
 */
export function useSyncCartFreeDeliveryProgress({ enabled = true, debounceMs = 350 } = {}) {
  const items = useCartStore((s) => s.items);
  const appliedCouponCode = useCartStore((s) => s.appliedCouponCode);
  const appliedCouponId = useCartStore((s) => s.appliedCouponId);
  const couponAutoApplyDisabled = useCartStore((s) => s.couponAutoApplyDisabled);
  const setFreeDeliveryProgress = useCartStore((s) => s.setFreeDeliveryProgress);
  const setFreeDeliveryUnlocked = useCartStore((s) => s.setFreeDeliveryUnlocked);

  const seqRef = useRef(0);

  // Mirrors CartScreen's validItems filter — a malformed/stale cart entry
  // (no product.id) must not throw inside the debounced calculate below.
  const validItems = items.filter((item) => item?.product?.id);

  // Fingerprint so we re-run on qty/price identity, not only array length.
  const cartKey = validItems
    .map((item) => {
      const id = item?.product?.id ?? '';
      const variantId = item?.variant?.id ?? '';
      const type = item?.type || 'product';
      const qty = item?.quantity ?? 0;
      return `${type}:${id}:${variantId}:${qty}`;
    })
    .join('|');

  useEffect(() => {
    if (!enabled) return undefined;

    if (!validItems.length) {
      setFreeDeliveryProgress(null);
      setFreeDeliveryUnlocked(false);
      return undefined;
    }

    let cancelled = false;
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      try {
        // Read coupon flags at request time (not only effect-deps) so a remove
        // mid-debounce still uses the latest store values.
        const {
          appliedCouponCode: code,
          appliedCouponId: couponId,
          couponAutoApplyDisabled: noAuto,
          appliedCoupon,
          setAppliedCoupon,
          softClearAppliedCoupon,
        } = useCartStore.getState();

        const payload = {
          items: validItems.map((item) => ({
            productId: item.product.id,
            variantId: item.variant?.id ?? null,
            quantity: item.quantity,
            type: item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product'),
            isCombo: (item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product')) === 'combo',
          })),
          coupon_code: code || undefined,
          coupon_id: !code && couponId ? couponId : undefined,
          no_auto_apply: noAuto,
        };

        const calculated = normalizeCartCalculation(await cartApi.calculate(payload));
        if (cancelled || seq !== seqRef.current) return;

        setFreeDeliveryProgress(calculated.freeDeliveryProgress);
        const unlocked = Boolean(
          calculated.appliedCoupon
          && Number(calculated.appliedCoupon.freeDeliveryWaiver || 0) > 0,
        );
        setFreeDeliveryUnlocked(unlocked);

        // Keep coupon row in store consistent with bill (same as CartScreen).
        if (calculated.appliedCoupon) {
          setAppliedCoupon(calculated.appliedCoupon.code, calculated.appliedCoupon);
        } else if (appliedCoupon || code || couponId) {
          softClearAppliedCoupon();
        }
      } catch (_) {
        // Non-fatal: keep last progress; live recompute still works for amount.
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // cartKey captures item identity; coupon flags affect free-delivery apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    cartKey,
    appliedCouponCode,
    appliedCouponId,
    couponAutoApplyDisabled,
    debounceMs,
  ]);
}

export default useSyncCartFreeDeliveryProgress;
