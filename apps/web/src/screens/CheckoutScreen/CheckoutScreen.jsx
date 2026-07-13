import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi } from '../../api/cartApi';
import { ordersApi } from '../../api/ordersApi';
import { settingsApi } from '../../api/settingsApi';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import CouponSheet from '../../components/CouponSheet/CouponSheet';
import BillSummary from '../../components/BillSummary/BillSummary';
import { formatPrice } from '../../utils/formatters';
import { formatEtaMinutes } from '../../utils/formatEta';
import { isCodBlockedDuringNight } from '../../utils/nightDelivery';
import { toCartApiItem } from '../../utils/productUtils';
import './CheckoutScreen.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

const LocationIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

export default function CheckoutScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const appliedCouponCode = useCartStore((state) => state.appliedCouponCode);
  const appliedCouponId = useCartStore((state) => state.appliedCouponId);
  const couponAutoApplyDisabled = useCartStore((state) => state.couponAutoApplyDisabled);
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const setAppliedCoupon = useCartStore((state) => state.setAppliedCoupon);
  const clearAppliedCoupon = useCartStore((state) => state.clearAppliedCoupon);
  const setFreeDeliveryProgress = useCartStore((state) => state.setFreeDeliveryProgress);
  const [showCouponSheet, setShowCouponSheet] = useState(false);
  const settings = useSettingsStore((state) => state.settings);
  const shopStatus = useSettingsStore((state) => state.shopStatus);
  const setSettings = useSettingsStore((state) => state.setSettings);

  const [address, setAddress] = useState(user?.address || '');
  const [coords, setCoords] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | success | error
  const [deliveryType, setDeliveryType] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('cod');

  const [bill, setBill] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [noticeMessage, setNoticeMessage] = useState(null);
  const [hydrated, setHydrated] = useState(
    useCartStore.persist?.hasHydrated?.() ?? true
  );

  const isSubmitting = useRef(false);
  const debounceRef = useRef(null);
  const addressTouchedRef = useRef(false);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(tick);
  }, []);

  const codBlockedByNight = isCodBlockedDuringNight(settings, now);
  useEffect(() => {
    if (codBlockedByNight && paymentMethod === 'cod') {
      setPaymentMethod('upi');
    }
  }, [codBlockedByNight, paymentMethod]);

  const nightWindowStart = settings?.night_charge_start || settings?.nightChargeStart || null;
  const nightWindowEnd = settings?.night_charge_end || settings?.nightChargeEnd || null;

  // After bill is calculated — distance row (must read bill AFTER useState)
  const deliveryDistanceRaw = bill?.distanceKm ?? bill?.distance_km;
  const hasDeliveryDistance =
    deliveryDistanceRaw != null && Number.isFinite(Number(deliveryDistanceRaw));
  const deliveryDistanceKm = hasDeliveryDistance ? Number(deliveryDistanceRaw) : null;

  const [idempotencyKey] = useState(() => {
    const c =
      (typeof crypto !== 'undefined' && crypto) ||
      (typeof window !== 'undefined' && window.crypto) ||
      null;
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }
    let hex = '';
    while (hex.length < 32) {
      hex += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
    }
    return hex.slice(0, 32);
  });

  useEffect(() => {
    if (hydrated) return;
    const unsubFinish = useCartStore.persist.onFinishHydration(() => setHydrated(true));
    return () => {
      if (typeof unsubFinish === 'function') unsubFinish();
    };
  }, [hydrated]);

  // Fresh settings on checkout (UPI QR, night charge window)
  useEffect(() => {
    let active = true;
    settingsApi
      .getSettings()
      .then((res) => {
        if (!active) return;
        const payload = res.data || res;
        setSettings?.(payload.settings || payload);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [setSettings]);

  // Prefill address from last order if profile has none
  useEffect(() => {
    if (user?.address) return;
    let active = true;
    ordersApi
      .getOrders({ limit: 1 })
      .then((res) => {
        if (!active || addressTouchedRef.current) return;
        const payload = res.data || res;
        const list = payload.orders || (Array.isArray(payload) ? payload : []);
        const last = list[0];
        if (last?.address || last?.delivery_address) {
          setAddress(last.address || last.delivery_address);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.address]);

  useEffect(() => {
    if (!hydrated) return;
    if (items.length === 0) {
      navigate('/', { replace: true });
      return;
    }

    const calculateCart = async () => {
      setCalculating(true);
      try {
        const payload = {
          items: items.map(toCartApiItem),
          delivery_type: deliveryType,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
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

        if (deliveryType === 'fast' && responsePayload.fastDeliveryEnabled === false) {
          setDeliveryType('standard');
          setNoticeMessage(
            'Express delivery is not available in your area. Switched to standard delivery.'
          );
        }
      } catch (err) {
        console.error('Failed to calculate cart', err);
        setErrorMessage('Failed to calculate delivery charges. Please try again.');
      } finally {
        setCalculating(false);
      }
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(calculateCart, 250);

    return () => clearTimeout(debounceRef.current);
  }, [
    items,
    deliveryType,
    coords,
    navigate,
    hydrated,
    appliedCouponCode,
    appliedCouponId,
    couponAutoApplyDisabled,
    setAppliedCoupon,
    clearAppliedCoupon,
    setFreeDeliveryProgress,
  ]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setGpsStatus('success');
        setErrorMessage(null);
      },
      (err) => {
        console.error(err);
        setGpsStatus('error');
        setErrorMessage('Unable to retrieve your location.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting.current) return;
    if (!address.trim()) {
      setErrorMessage('Please enter your delivery address.');
      return;
    }
    if (shopStatus === 'closed') {
      setErrorMessage('Shop is currently closed.');
      return;
    }
    if (!bill) return;

    if (bill.belowThreshold) {
      setErrorMessage(`Minimum order is ${formatPrice(bill.minimumOrder)}.`);
      return;
    }

    isSubmitting.current = true;
    setPlacing(true);
    setErrorMessage(null);

    try {
      const payload = {
        items: items.map((i) => {
          const apiItem = toCartApiItem(i);
          return {
            productId: apiItem.productId,
            variantId: apiItem.variantId,
            quantity: apiItem.quantity,
            type: apiItem.type,
            isCombo: apiItem.isCombo,
            price: i.variant?.price ?? i.product.price,
          };
        }),
        address,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        delivery_type: deliveryType,
        payment_method: paymentMethod === 'cod' ? 'Cash' : 'UPI',
        subtotal: bill.subtotal,
        delivery_charge: bill.deliveryCharge,
        discount: bill.discount,
        night_charge: bill.nightCharge,
        total_amount: bill.grandTotal,
        coupon_code: appliedCoupon?.code || appliedCouponCode || undefined,
        coupon_id:
          appliedCoupon?.id ||
          (!appliedCouponCode && appliedCouponId ? appliedCouponId : undefined),
        idempotencyKey,
      };

      const res = await ordersApi.createOrder(payload);
      const responsePayload = res.data || res;
      const orderId = responsePayload.order_id || responsePayload.id;
      navigate(`/order-confirmation/${orderId}`, {
        replace: true,
        state: { confirmation: true },
      });
      clearCart();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to place order. Please try again.');
      isSubmitting.current = false;
    } finally {
      setPlacing(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="screen-container">
        <div className="checkout-header">
          <button className="co-back-btn" onClick={() => navigate(-1)} type="button">
            <BackIcon />
          </button>
          <div className="co-title">Checkout</div>
        </div>
        <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  const gpsLabel =
    gpsStatus === 'loading'
      ? 'Getting location...'
      : gpsStatus === 'success' || coords
        ? 'Location pinned!'
        : gpsStatus === 'error'
          ? 'Retry pin location'
          : 'Pin My Location (Optional)';

  return (
    <div className="screen-container checkout-screen">
      <div className="checkout-header">
        <button className="co-back-btn" onClick={() => navigate(-1)} type="button">
          <BackIcon />
        </button>
        <div className="co-title">Checkout</div>
      </div>

      <div className="co-content">
        {errorMessage && (
          <div className="co-error" role="alert">
            <span>{errorMessage}</span>
            <button
              type="button"
              className="co-error-dismiss"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {noticeMessage && (
          <div className="co-notice" role="status">
            <span>{noticeMessage}</span>
            <button
              type="button"
              className="co-notice-dismiss"
              onClick={() => setNoticeMessage(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div className="co-section">
          <div className="co-section-title">Delivery Address</div>
          <textarea
            className="co-address-textarea"
            placeholder="Enter full address details (House No, Street, Landmark...)"
            value={address}
            onChange={(e) => {
              addressTouchedRef.current = true;
              setAddress(e.target.value);
            }}
          />
          <button
            type="button"
            className="co-gps-btn"
            onClick={handleGetLocation}
            disabled={gpsStatus === 'loading'}
          >
            <LocationIcon />
            {gpsLabel}
          </button>
        </div>

        {bill?.fastDeliveryEnabled && (
          <div className="co-section">
            <div className="co-section-title">Delivery Speed</div>
            <div className="co-radio-group">
              <label className={`co-radio-card ${deliveryType === 'standard' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="speed"
                  checked={deliveryType === 'standard'}
                  onChange={() => setDeliveryType('standard')}
                />
                <div className="co-radio-content">
                  <div className="co-radio-title">Standard Delivery</div>
                  <div className="co-radio-desc">
                    Usually takes {formatEtaMinutes(bill?.standardDeliveryMinutes) || '—'}
                  </div>
                </div>
              </label>

              <label className={`co-radio-card ${deliveryType === 'fast' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="speed"
                  checked={deliveryType === 'fast'}
                  onChange={() => setDeliveryType('fast')}
                />
                <div className="co-radio-content">
                  <div className="co-radio-title">
                    Express Delivery (₹{bill?.fastDeliveryCharge || '10'})
                  </div>
                  <div className="co-radio-desc">
                    Prioritized preparation & delivery — arrives in{' '}
                    {formatEtaMinutes(bill?.fastDeliveryMinutes) || '—'}
                  </div>
                </div>
              </label>
            </div>
            {hasDeliveryDistance && (
              <div className="co-distance-row" data-testid="co-delivery-distance">
                Delivery distance: {deliveryDistanceKm} km
              </div>
            )}
          </div>
        )}

        <div className="co-section">
          <div className="co-section-title">Payment Method</div>
          {codBlockedByNight && (
            <div className="co-night-notice" role="status">
              <span>
                Cash on Delivery is unavailable during night delivery hours
                {nightWindowStart && nightWindowEnd
                  ? ` (${nightWindowStart} to ${nightWindowEnd})`
                  : ''}
                . Please use UPI.
              </span>
            </div>
          )}
          <div className="co-radio-group">
            <label
              className={`co-radio-card ${paymentMethod === 'cod' ? 'active' : ''} ${
                codBlockedByNight ? 'disabled' : ''
              }`}
            >
              <input
                type="radio"
                name="payment"
                checked={paymentMethod === 'cod'}
                disabled={codBlockedByNight}
                onChange={() => {
                  if (!codBlockedByNight) setPaymentMethod('cod');
                }}
              />
              <div className="co-radio-content">
                <div className="co-radio-title">Cash on Delivery</div>
                <div className="co-radio-desc">
                  {codBlockedByNight
                    ? 'Unavailable during night hours'
                    : 'Pay when your order arrives'}
                </div>
              </div>
            </label>

            <label className={`co-radio-card ${paymentMethod === 'upi' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                checked={paymentMethod === 'upi'}
                onChange={() => setPaymentMethod('upi')}
              />
              <div className="co-radio-content">
                <div className="co-radio-title">UPI / QR Code</div>
                <div className="co-radio-desc">Scan and pay online</div>
              </div>
            </label>
          </div>

          {paymentMethod === 'upi' &&
            (settings?.upi_qr_image_id ||
              settings?.upiQrImageId ||
              settings?.upi_qr_image_url ||
              settings?.upiQrImageUrl) && (
              <div className="upi-qr-container">
                <img
                  src={
                    settings?.upi_qr_image_url ||
                    settings?.upiQrImageUrl ||
                    `${API_BASE_URL}/images/${settings.upi_qr_image_id || settings.upiQrImageId}`
                  }
                  alt="UPI QR"
                  className="upi-qr-img"
                />
                {(settings?.upi_id || settings?.upiId) && (
                  <div className="upi-id">{settings.upi_id || settings.upiId}</div>
                )}
                <div className="co-radio-desc text-center">
                  Scan the QR code with any UPI app and show the screenshot to the delivery
                  partner.
                </div>
              </div>
            )}
        </div>

        {bill && (
          <>
            <div className="co-section">
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
            </div>

            <div className="co-section">
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
            </div>
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

      <div className="co-bottom-bar">
        <Button
          variant="highlight"
          disabled={shopStatus === 'closed' || calculating || placing || !bill || bill.belowThreshold}
          onClick={handlePlaceOrder}
        >
          {placing
            ? 'Placing Order...'
            : calculating
              ? 'Calculating...'
              : `Place Order (${formatPrice(bill?.grandTotal)})`}
        </Button>
      </div>
    </div>
  );
}
