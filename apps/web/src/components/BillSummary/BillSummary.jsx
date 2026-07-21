import { useSettingsStore } from '../../stores/settingsStore';
import './BillSummary.css';

/**
 * BillSummary
 * Displays cart/order bill breakdown.
 *
 * Props:
 *   subtotal          - number
 *   deliveryCharge    - number
 *   nightCharge       - number (0 or undefined = not shown)
 *   rainCharge        - number (0 or undefined = not shown)
 *   fastDeliveryFee   - number (0 or undefined = not shown) — additive Fast
 *                        Delivery add-on on top of the (always-standard)
 *                        Delivery Charge row; never discounted
 *   discount          - number (0 or undefined = not shown) — total coupon discount
 *   itemDiscount      - number — discount excluding any free-delivery waiver
 *   isFreeDeliveryApplied - bool — renders Delivery Charge as struck-through + FREE
 *   total             - number (grand total)
 *   freeDeliveryProgress - { minOrder, amountRemaining, minItemCount, itemsRemaining,
 *                            thresholdType: 'amount' | 'items' } | null — from the
 *                           cart-calculate response; shows a hint when set
 */
function BillSummary({
  subtotal = 0,
  deliveryCharge = 0,
  nightCharge = 0,
  rainCharge = 0,
  fastDeliveryFee = 0,
  discount = 0,
  itemDiscount = null,
  isFreeDeliveryApplied = false,
  total = 0,
  freeDeliveryProgress = null,
  className = '',
}) {
  const settings = useSettingsStore((state) => state.settings);
  const freeDeliveryThreshold = Number(settings?.freeDeliveryThreshold) || 0;
  const showFreeDeliveryProgress = freeDeliveryThreshold > 0;
  const freeDeliveryUnlocked = showFreeDeliveryProgress && subtotal >= freeDeliveryThreshold;
  const freeDeliveryAmountRemaining = Math.max(0, Math.round(freeDeliveryThreshold - subtotal));
  const freeDeliveryPercent = showFreeDeliveryProgress
    ? Math.min(100, (subtotal / freeDeliveryThreshold) * 100)
    : 0;

  const showNight = nightCharge > 0;
  const showRain = rainCharge > 0;
  const showFastFee = fastDeliveryFee > 0;
  const discountToShow = isFreeDeliveryApplied ? (itemDiscount ?? Math.max(0, discount - deliveryCharge)) : discount;
  const showDiscount = discountToShow > 0;

  return (
    <div className={`bill-summary ${className}`}>
      <div className="bill-summary-heading">Bill Summary</div>

      <div className="bill-row">
        <div className="bill-row-label">Subtotal</div>
        <div className="bill-row-value">{formatPrice(subtotal)}</div>
      </div>

      {showFreeDeliveryProgress && (
        <div className="bill-free-delivery-progress">
          <div
            className={`bill-free-delivery-text${freeDeliveryUnlocked ? ' bill-free-delivery-text--unlocked' : ''}`}
          >
            {freeDeliveryUnlocked
              ? 'You unlocked free delivery!'
              : `Add ₹${freeDeliveryAmountRemaining} more for free delivery`}
          </div>
          <div className="bill-free-delivery-bar">
            <div
              className={`bill-free-delivery-bar-fill${freeDeliveryUnlocked ? ' bill-free-delivery-bar-fill--unlocked' : ''}`}
              style={{ width: `${freeDeliveryPercent}%` }}
            />
          </div>
        </div>
      )}

      {isFreeDeliveryApplied ? (
        <div className="bill-row">
          <div className="bill-row-label">Delivery Charge</div>
          <div className="bill-free-delivery">
            <span className="bill-delivery-strikethrough">{formatPrice(deliveryCharge)}</span>
            <span className="bill-free-text">FREE</span>
          </div>
        </div>
      ) : (
        <div className="bill-row">
          <div className="bill-row-label">Delivery Charge</div>
          <div className="bill-row-value">{formatPrice(deliveryCharge)}</div>
        </div>
      )}

      {showFastFee && (
        <div className="bill-row">
          <div className="bill-row-label">Fast Delivery Add-on</div>
          <div className="bill-row-value bill-fast-delivery-fee">{formatPrice(fastDeliveryFee)}</div>
        </div>
      )}

      {showNight && (
        <div className="bill-row">
          <div className="bill-row-label">Night Charge</div>
          <div className="bill-row-value bill-night-charge">{formatPrice(nightCharge)}</div>
        </div>
      )}

      {showRain && (
        <div className="bill-row">
          <div className="bill-row-label">Rain Charge</div>
          <div className="bill-row-value bill-rain-charge">{formatPrice(rainCharge)}</div>
        </div>
      )}

      {showDiscount && (
        <div className="bill-row">
          <div className="bill-row-label">Discount</div>
          <div className="bill-row-value bill-discount">-{formatPrice(discountToShow)}</div>
        </div>
      )}

      <div className="bill-divider"></div>

      <div className="bill-row">
        <div className="bill-row-label bill-total-label">Grand Total</div>
        <div className="bill-row-value bill-total-value">{formatPrice(total)}</div>
      </div>

      {freeDeliveryProgress && (
        <div className="bill-min-order-warn">
          <div className="bill-min-order-text">
            {buildProgressHintText(freeDeliveryProgress, { suffix: ' to unlock free delivery.' })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPrice(price) {
  if (price === null || price === undefined || isNaN(price)) return '—';
  return `₹${Number(price).toFixed(0)}`;
}

function buildProgressHintText(progress, { suffix = '' } = {}) {
  if (!progress) return '';
  const { thresholdType, amountRemaining, itemsRemaining } = progress;

  if (thresholdType === 'items') {
    if (itemsRemaining <= 0) return 'You unlocked free delivery!';
    const noun = itemsRemaining === 1 ? 'item' : 'items';
    return `Add ${itemsRemaining} more ${noun} for free delivery${suffix}`;
  }

  if (amountRemaining <= 0) return 'You unlocked free delivery!';
  return `Add ₹${amountRemaining} more for free delivery${suffix}`;
}

export default BillSummary;