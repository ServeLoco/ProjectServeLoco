import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi } from '../../api/cartApi';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import QuantityControl from '../../components/QuantityControl';
import EmptyState from '../../components/EmptyState';
import BillSummary from '../../components/BillSummary/BillSummary';
import CouponSheet from '../../components/CouponSheet/CouponSheet';
import ShopClosedBanner from '../../components/ShopClosedBanner';
import { formatPrice } from '../../utils/formatters';
import { getResolvedImageUrl } from '../../utils/imageUtils';
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
  const items = useCartStore((state) => state.items);
  const updateQty = useCartStore((state) => state.updateQty);
  const removeItem = useCartStore((state) => state.removeItem);
  const settings = useSettingsStore((state) => state.settings);
  const shopStatus = useSettingsStore((state) => state.shopStatus);
  // Primary check: shopStatus === 'closed' means the shop is closed. Defaults to 'open'.
  const storeClosed = shopStatus === 'closed';

  const appliedCouponCode = useCartStore((state) => state.appliedCouponCode);
  const appliedCouponId = useCartStore((state) => state.appliedCouponId);
  const couponAutoApplyDisabled = useCartStore((state) => state.couponAutoApplyDisabled);
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const setAppliedCoupon = useCartStore((state) => state.setAppliedCoupon);
  const clearAppliedCoupon = useCartStore((state) => state.clearAppliedCoupon);

  const [bill, setBill] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [showCouponSheet, setShowCouponSheet] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (items.length === 0) {
      setBill(null);
      return;
    }

    const calculateCart = async () => {
      setCalculating(true);
      try {
        const payload = {
          items: items.map(i => ({
            productId: i.product.id,
            quantity: i.quantity,
            type: i.type,
            isCombo: i.type === 'combo'
          })),
          coupon_code: appliedCouponCode || undefined,
          coupon_id: !appliedCouponCode && appliedCouponId ? appliedCouponId : undefined,
          no_auto_apply: couponAutoApplyDisabled,
        };
        const res = await cartApi.calculate(payload);
        const responsePayload = res.data || res;
        setBill(responsePayload);

        // Sync coupon state from the server (handles auto-apply + validation).
        if (responsePayload.appliedCoupon) {
          setAppliedCoupon(responsePayload.appliedCoupon.code, responsePayload.appliedCoupon);
        } else if (responsePayload.couponError && (appliedCouponCode || appliedCouponId)) {
          clearAppliedCoupon();
        }
      } catch (err) {
        console.error('Failed to calculate cart', err);
      } finally {
        setCalculating(false);
      }
    };

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      calculateCart();
    }, 300);

    return () => clearTimeout(timeoutRef.current);
  }, [items, appliedCouponCode, appliedCouponId, couponAutoApplyDisabled]);

  if (items.length === 0) {
    return (
      <div className="screen-container">
        <div className="cart-header">
          <button className="cart-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
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
        <button className="cart-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
        <div className="cart-title">Your Cart</div>
      </div>

      <div className="cart-content">
        {storeClosed && (
          <div className="cart-shop-closed-wrap">
            <ShopClosedBanner />
          </div>
        )}

        <div className="cart-items-list">
          {items.map((item, idx) => (
            <div key={`${item.product.id}-${item.type}-${idx}`} className="cart-item-row">
              <img
                src={getResolvedImageUrl(item.product)}
                alt={item.product.name}
                className="cart-item-img"
              />
              <div className="cart-item-info">
                <div className="cart-item-name">{item.product.name}</div>
                <div className="cart-item-unit">{item.product.unit || '1 unit'}</div>
                <div className="cart-item-price">{formatPrice(item.product.price)}</div>
              </div>
              <div className="cart-item-actions">
                <button className="delete-btn" onClick={() => removeItem(item.product.id, item.type)}>
                  <TrashIcon />
                </button>
                <QuantityControl 
                  quantity={item.quantity} 
                  onIncrease={() => updateQty(item.product.id, item.quantity + 1, item.type)} 
                  onDecrease={() => updateQty(item.product.id, item.quantity - 1, item.type)} 
                />
              </div>
            </div>
          ))}
        </div>

        {bill && (
          <>
            <button className="coupon-card" onClick={() => setShowCouponSheet(true)}>
              <div className="coupon-card-left">
                <div className="coupon-card-icon">%</div>
                <div>
                  {appliedCoupon ? (
                    <>
                      <div className="coupon-card-title">{appliedCoupon.title || appliedCoupon.code}</div>
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
                  <span className="coupon-card-applied" onClick={(e) => { e.stopPropagation(); clearAppliedCoupon(); }}>Remove</span>
                ) : (
                  <span className="coupon-card-apply">Apply</span>
                )}
              </div>
            </button>

            <BillSummary
              subtotal={bill.subtotal}
              deliveryCharge={bill.deliveryCharge}
              nightCharge={bill.nightCharge}
              discount={bill.discount}
              itemDiscount={bill.itemDiscount}
              isFreeDeliveryApplied={bill.isFreeDeliveryApplied === true}
              total={bill.grandTotal}
              freeDeliveryProgress={bill.freeDeliveryProgress}
            />
          </>
        )}

        <CouponSheet
          open={showCouponSheet}
          onClose={() => setShowCouponSheet(false)}
          subtotal={bill?.subtotal || 0}
          deliveryCharge={bill?.deliveryCharge || 0}
          appliedCoupon={appliedCoupon}
          onApply={(coupon) => setAppliedCoupon(coupon.code, coupon)}
          onRemove={() => clearAppliedCoupon()}
        />
      </div>

      <div className="cart-bottom-bar">
        <Button 
          variant="success" 
          disabled={storeClosed || calculating || !bill}
          onClick={() => navigate('/checkout')}
        >
          {storeClosed
            ? 'Shop Closed'
            : calculating
              ? 'Calculating...'
              : `Proceed to Pay (${bill ? formatPrice(bill.grandTotal) : ''})`}
        </Button>
      </div>
    </div>
  );
}
