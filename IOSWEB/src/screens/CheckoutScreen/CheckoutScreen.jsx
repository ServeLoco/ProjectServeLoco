import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi } from '../../api/cartApi';
import { ordersApi } from '../../api/ordersApi';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import { formatPrice } from '../../utils/formatters';
import { isCodBlockedDuringNight } from '../../utils/nightDelivery';
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
  const user = useAuthStore(state => state.user);
  const items = useCartStore(state => state.items);
  const clearCart = useCartStore(state => state.clearCart);
  const { settings, shopOpen } = useSettingsStore();

  const [address, setAddress] = useState(user?.address || '');
  const [coords, setCoords] = useState(null); // { latitude, longitude }
  const [deliveryType, setDeliveryType] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('cod');

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

  useEffect(() => {
    if (hydrated) return;
    const unsubFinish = useCartStore.persist.onFinishHydration(() => setHydrated(true));
    return () => {
      if (typeof unsubFinish === 'function') unsubFinish();
    };
  }, [hydrated]);

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
          items: items.map(i => ({
            productId: i.product.id,
            quantity: i.quantity,
            type: i.type,
            isCombo: i.type === 'combo'
          })),
          delivery_type: deliveryType,
          latitude: coords?.latitude,
          longitude: coords?.longitude
        };
        const res = await cartApi.calculate(payload);
        const responsePayload = res.data || res;
        setBill(responsePayload);
        
        if (deliveryType === 'fast' && !responsePayload.fastDeliveryEnabled) {
          setDeliveryType('standard');
          setNoticeMessage('Express delivery is not available in your area. Switched to standard delivery.');
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
  }, [items, deliveryType, coords, navigate, hydrated]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
        setErrorMessage(null);
      },
      (err) => {
        console.error(err);
        setErrorMessage('Unable to retrieve your location.');
      }
    );
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting.current) return;
    if (!address.trim()) {
      setErrorMessage('Please enter your delivery address.');
      return;
    }
    if (!shopOpen) {
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
        items: items.map(i => ({
          productId: i.product.id,
          quantity: i.quantity,
          type: i.type,
          price: i.product.price
        })),
        address: address,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        delivery_type: deliveryType,
        payment_method: paymentMethod === 'cod' ? 'Cash' : 'UPI',
        subtotal: bill.subtotal,
        delivery_charge: bill.deliveryCharge,
        discount: bill.discount,
        night_charge: bill.nightCharge,
        total_amount: bill.grandTotal
      };
      
      const res = await ordersApi.createOrder(payload);
      const responsePayload = res.data || res;
      const orderId = responsePayload.order_id || responsePayload.id;
      // Navigate first; clear cart after navigation so a thrown navigate doesn't lose the cart.
      // The `confirmation` state flag is read by OrderConfirmationScreen to
      // decide whether to render (true) or bounce to home (false, e.g. when
      // the user types the URL or hits back).
      navigate(`/order-confirmation/${orderId}`, { replace: true, state: { confirmation: true } });
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
          <button className="co-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="co-title">Checkout</div>
        </div>
        <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="screen-container checkout-screen">
      <div className="checkout-header">
        <button className="co-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
        <div className="co-title">Checkout</div>
      </div>

      <div className="co-content">
        {errorMessage && (
          <div className="co-error" role="alert">
            <span>{errorMessage}</span>
            <button className="co-error-dismiss" onClick={() => setErrorMessage(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        {noticeMessage && (
          <div className="co-notice" role="status">
            <span>{noticeMessage}</span>
            <button className="co-notice-dismiss" onClick={() => setNoticeMessage(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        <div className="co-section">
          <div className="co-section-title">Delivery Address</div>
          <textarea 
            className="co-address-textarea"
            placeholder="Enter full address details (House No, Street, Landmark...)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button className="co-gps-btn" onClick={handleGetLocation}>
            <LocationIcon />
            {coords ? 'Location pinned!' : 'Pin My Location (Optional)'}
          </button>
        </div>

        {bill?.fastDeliveryEnabled && (
          <div className="co-section">
            <div className="co-section-title">Delivery Speed</div>
            <div className="co-radio-group">
              <label className={`co-radio-card ${deliveryType === 'standard' ? 'active' : ''}`}>
                <input type="radio" name="speed" checked={deliveryType === 'standard'} onChange={() => setDeliveryType('standard')} />
                <div className="co-radio-content">
                  <div className="co-radio-title">Standard Delivery</div>
                  <div className="co-radio-desc">Usually takes 30-45 mins</div>
                </div>
              </label>
              
              <label className={`co-radio-card ${deliveryType === 'fast' ? 'active' : ''}`}>
                <input type="radio" name="speed" checked={deliveryType === 'fast'} onChange={() => setDeliveryType('fast')} />
                <div className="co-radio-content">
                  <div className="co-radio-title">Express Delivery (₹{bill?.fastDeliveryCharge || '10'})</div>
                  <div className="co-radio-desc">Prioritized preparation & delivery</div>
                </div>
              </label>
            </div>
          </div>
        )}

        <div className="co-section">
          <div className="co-section-title">Payment Method</div>
          {codBlockedByNight && (
            <div className="co-night-notice" role="status">
              <span>
                Cash on Delivery is unavailable during night delivery hours
                {nightWindowStart && nightWindowEnd ? ` (${nightWindowStart} to ${nightWindowEnd})` : ''}. Please use UPI.
              </span>
            </div>
          )}
          <div className="co-radio-group">
            <label className={`co-radio-card ${paymentMethod === 'cod' ? 'active' : ''} ${codBlockedByNight ? 'disabled' : ''}`}>
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
                  {codBlockedByNight ? 'Unavailable during night hours' : 'Pay when your order arrives'}
                </div>
              </div>
            </label>

            <label className={`co-radio-card ${paymentMethod === 'upi' ? 'active' : ''}`}>
              <input type="radio" name="payment" checked={paymentMethod === 'upi'} onChange={() => setPaymentMethod('upi')} />
              <div className="co-radio-content">
                <div className="co-radio-title">UPI / QR Code</div>
                <div className="co-radio-desc">Scan and pay online</div>
              </div>
            </label>
          </div>

          {paymentMethod === 'upi' && settings?.upi_qr_image_id && (
            <div className="upi-qr-container">
              <img src={`${API_BASE_URL}/images/${settings.upi_qr_image_id}`} alt="UPI QR" className="upi-qr-img" />
              {settings?.upi_id && <div className="upi-id">{settings.upi_id}</div>}
              <div className="co-radio-desc text-center">Scan the QR code with any UPI app and show the screenshot to the delivery partner.</div>
            </div>
          )}
        </div>
      </div>

      <div className="co-bottom-bar">
        <Button 
          variant="highlight" 
          disabled={!shopOpen || calculating || placing || !bill || bill.belowThreshold}
          onClick={handlePlaceOrder}
        >
          {placing ? 'Placing Order...' : calculating ? 'Calculating...' : `Place Order (${formatPrice(bill?.grandTotal)})`}
        </Button>
      </div>
    </div>
  );
}
