import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi } from '../../api/cartApi';
import { ordersApi } from '../../api/ordersApi';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import { formatPrice } from '../../utils/formatters';
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
  
  const [bill, setBill] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [calculateError, setCalculateError] = useState(null);

  const isSubmitting = useRef(false);
  const debounceRef = useRef(null);

  // Recalculate bill when deliveryType or coords change
  useEffect(() => {
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
        setCalculateError(null);
        
        // If fast delivery is disabled by backend but user selected it, fallback
        if (deliveryType === 'fast' && !responsePayload.fastDeliveryEnabled) {
          setDeliveryType('standard');
        }
      } catch (err) {
        console.error('Failed to calculate cart', err);
        setCalculateError(err);
      } finally {
        setCalculating(false);
      }
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(calculateCart, 250);
    
    return () => clearTimeout(debounceRef.current);
  }, [items, deliveryType, coords, navigate]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      },
      (err) => {
        alert("Unable to retrieve your location");
        console.error(err);
      }
    );
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting.current) return;
    if (!address.trim()) {
      alert("Please enter your delivery address");
      return;
    }
    if (!shopOpen) {
      alert("Shop is currently closed");
      return;
    }
    if (!bill) return;
    
    // Check minimum order
    if (bill.belowThreshold) {
      alert(`Minimum order is ${formatPrice(bill.minimumOrder)}`);
      return;
    }

    isSubmitting.current = true;
    setPlacing(true);

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
      clearCart();
      navigate(`/order-confirmation/${responsePayload.order_id || responsePayload.id}`, { replace: true });
    } catch (err) {
      alert(err.message || "Failed to place order. Please try again.");
      isSubmitting.current = false;
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="screen-container checkout-screen">
      <div className="checkout-header">
        <button className="co-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
        <div className="co-title">Checkout</div>
      </div>

      <div className="co-content">
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
          <div className="co-radio-group">
            <label className={`co-radio-card ${paymentMethod === 'cod' ? 'active' : ''}`}>
              <input type="radio" name="payment" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} />
              <div className="co-radio-content">
                <div className="co-radio-title">Cash on Delivery</div>
                <div className="co-radio-desc">Pay when your order arrives</div>
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
