import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi } from '../../api/cartApi';
import { useCartStore, lineUnitPrice, selectCartDisplayTotal } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/Button';
import QuantityControl from '../../components/QuantityControl';
import EmptyState from '../../components/EmptyState';
import BillSummary from '../../components/BillSummary/BillSummary';
import CouponSheet from '../../components/CouponSheet/CouponSheet';
import ShopClosedBanner from '../../components/ShopClosedBanner';
import { formatPrice } from '../../utils/formatters';
import { getResolvedImageUrl } from '../../utils/imageUtils';
import { toCartApiItem } from '../../utils/productUtils';
import './CartScreen.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

export default function CartScreen() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const items = useCartStore((state) => state.items);
  const updateQty = useCartStore((state) => state.updateQty);
  const removeItem = useCartStore((state) => state.removeItem);
  const displayTotal = useCartStore(selectCartDisplayTotal);
  const shopStatus = useSettingsStore((state) => state.shopStatus);
  const storeClosed = shopStatus === 'closed';

  const appliedCouponCode = useCartStore((state) => state.appliedCouponCode);
  const appliedCouponId = useCartStore((state) => state.appliedCouponId);
  const couponAutoApplyDisabled = useCartStore((state) => state.couponAutoApplyDisabled);
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const setAppliedCoupon = useCartStore((state) => state.setAppliedCoupon);
  const clearAppliedCoupon = useCartStore((state) => state.clearAppliedCoupon);
  const setFreeDeliveryProgress = useCartStore((state) => state.setFreeDeliveryProgress);

  const [bill, setBill] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState(null);
  const [showCouponSheet, setShowCouponSheet] = useState(false);
  const timeoutRef = useRef(null);

  // Guest-friendly fallback while not logged in (API requires auth for /cart/calculate)
  const localBill = useMemo(
    () => ({
      subtotal: displayTotal,
      deliveryCharge: 0,
      nightCharge: 0,
      rainCharge: 0,
      fastDeliveryFee: 0,
      discount: 0,
      itemDiscount: 0,
      grandTotal: displayTotal,
      isLocalEstimate: true,
    }),
    [displayTotal]
  );

  useEffect(() => {
    if (items.length === 0) {
      setBill(null);
      setCalcError(null);
      return;
    }

    if (!token) {
      setBill(localBill);
      setCalcError(null);
      setCalculating(false);
      return;
    }

    const calculateCart = async () => {
      setCalculating(true);
      setCalcError(null);
      try {
        const payload = {
          items: items.map(toCartApiItem),
          coupon_code: appliedCouponCode || undefined,
          coupon_id: !appliedCouponCode && appliedCouponId ? appliedCouponId : undefined,
          no_auto_apply: couponAutoApplyDisabled,
        };
        const res = await cartApi.calculate(payload);
        const responsePayload = res.data || res;
        setBill(responsePayload);

        if (responsePayload.freeDeliveryProgress) {
          setFreeDeliveryProgress(responsePayload.freeDeliveryProgress);
        }

        if (responsePayload.appliedCoupon) {
          setAppliedCoupon(responsePayload.appliedCoupon.code, responsePayload.appliedCoupon);
        } else if (responsePayload.couponError && (appliedCouponCode || appliedCouponId)) {
          clearAppliedCoupon();
        }
      } catch (err) {
        console.error('Failed to calculate cart', err);
        setCalcError(err.message || 'Could not calculate bill');
        setBill(localBill);
      } finally {
        setCalculating(false);
      }
    };

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      calculateCart();
    }, 300);

    return () => clearTimeout(timeoutRef.current);
  }, [
    items,
    token,
    localBill,
    appliedCouponCode,
    appliedCouponId,
    couponAutoApplyDisabled,
    setAppliedCoupon,
    clearAppliedCoupon,
    setFreeDeliveryProgress,
  ]);

  if (items.length === 0) {
    return (
      <div className="screen-container">
        <div className="cart-header">
          <button className="cart-back-btn" onClick={() => navigate(-1)} type="button">
            <BackIcon />
          </button>
          <div className="cart-title">Your Cart</div>
        </div>
        <EmptyState
          title="Your Cart is Empty"
          message="Looks like you haven't added anything yet."
          action={<Button onClick={() => navigate('/')}>Start Shopping</Button>}
        />
      </div>
    );
  }

  return (
    <div className="screen-container cart-screen">
      <div className="cart-header">
        <button className="cart-back-btn" onClick={() => navigate(-1)} type="button">
          <BackIcon />
        </button>
        <div className="cart-title">Your Cart</div>
      </div>

      <div className="cart-content">
        {storeClosed && (
          <div className="cart-shop-closed-wrap">
            <ShopClosedBanner />
          </div>
        )}

        <div className="cart-items-list">
          {items.map((item) => {
            const variantId = item.variant?.id ?? null;
            const unitPrice = lineUnitPrice(item);
            const lineKey = `${item.type}-${item.product.id}-${variantId ?? 'base'}`;
            return (
              <div key={lineKey} className="cart-item-row">
                <img
                  src={getResolvedImageUrl(item.product)}
                  alt={item.product.name}
                  className="cart-item-img"
                />
                <div className="cart-item-info">
                  <div className="cart-item-name">{item.product.name}</div>
                  <div className="cart-item-unit">
                    {item.variant?.label
                      || item.product.unit
                      || (item.type === 'combo' ? 'Combo' : '1 unit')}
                  </div>
                  <div className="cart-item-price">{formatPrice(unitPrice)}</div>
                </div>
                <div className="cart-item-actions">
                  <button
                    type="button"
                    className="delete-btn"
                    onClick={() => removeItem(item.product.id, item.type, variantId)}
                  >
                    <TrashIcon />
                  </button>
                  <QuantityControl
                    quantity={item.quantity}
                    onIncrease={() =>
                      updateQty(item.product.id, item.quantity + 1, item.type, variantId)
                    }
                    onDecrease={() =>
                      updateQty(item.product.id, item.quantity - 1, item.type, variantId)
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        {!token && (
          <div className="cart-login-hint" role="status">
            Log in to apply coupons and see exact delivery charges.
          </div>
        )}
        {calcError && token && (
          <div className="cart-login-hint" role="alert">{calcError}</div>
        )}

        {bill && (
          <>
            {token && !bill.isLocalEstimate && (
            <button
              type="button"
              className="coupon-card"
              onClick={() => setShowCouponSheet(true)}
            >
              <div className="coupon-card-left">
                <div className="coupon-card-icon">%</div>
                <div>
                  {appliedCoupon ? (
                    <>
                      <div className="coupon-card-title">
                        {appliedCoupon.title || appliedCoupon.code}
                      </div>
                      <div className="coupon-card-sub">Tap to change or remove</div>
                    </>
                  ) : (
                    <>
                      <div className="coupon-card-title">Apply coupon / offer</div>
                      <div className="coupon-card-sub">Save more on this order</div>
                    </>
                  )}
                </div>
              </div>
              <div className="coupon-card-action">
                {appliedCoupon ? (
                  <span
                    className="coupon-card-applied"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearAppliedCoupon();
                    }}
                  >
                    Remove
                  </span>
                ) : (
                  <span className="coupon-card-apply">Apply</span>
                )}
              </div>
            </button>
            )}

            <BillSummary
              subtotal={bill.subtotal}
              deliveryCharge={bill.deliveryCharge}
              nightCharge={bill.nightCharge}
              rainCharge={bill.rainCharge}
              fastDeliveryFee={bill.fastDeliveryFee}
              discount={bill.discount}
              itemDiscount={bill.itemDiscount}
              isFreeDeliveryApplied={bill.isFreeDeliveryApplied === true}
              total={bill.grandTotal}
              freeDeliveryProgress={bill.freeDeliveryProgress}
            />
            {bill.isLocalEstimate && (
              <div className="cart-estimate-note">Item total only — fees calculated at checkout after login.</div>
            )}
          </>
        )}

        {token && (
          <CouponSheet
            open={showCouponSheet}
            onClose={() => setShowCouponSheet(false)}
            subtotal={bill?.subtotal || 0}
            deliveryCharge={bill?.deliveryCharge || 0}
            appliedCoupon={appliedCoupon}
            onApply={(coupon) => setAppliedCoupon(coupon.code, coupon)}
            onRemove={() => clearAppliedCoupon()}
          />
        )}
      </div>

      <div className="cart-bottom-bar">
        <Button
          variant="success"
          disabled={storeClosed || calculating || !bill}
          onClick={() => {
            if (!token) {
              navigate('/auth', { state: { from: { pathname: '/checkout' } } });
              return;
            }
            navigate('/checkout');
          }}
        >
          {storeClosed
            ? 'Shop Closed'
            : calculating
              ? 'Calculating...'
              : !token
                ? `Login to checkout (${formatPrice(bill?.grandTotal || displayTotal)})`
                : `Proceed to Pay (${bill ? formatPrice(bill.grandTotal) : ''})`}
        </Button>
      </div>
    </div>
  );
}
