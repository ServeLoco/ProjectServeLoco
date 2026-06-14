import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi } from '../../api/cartApi';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import QuantityControl from '../../components/QuantityControl';
import EmptyState from '../../components/EmptyState';
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
  const shopOpen = useSettingsStore((state) => state.shopOpen);

  const [bill, setBill] = useState(null);
  const [calculating, setCalculating] = useState(false);
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
          }))
        };
        const res = await cartApi.calculate(payload);
        const responsePayload = res.data || res;
        setBill(responsePayload);
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
  }, [items]);

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
          <div className="bill-summary">
            <div className="bill-title">Bill Summary</div>
            <div className="bill-row">
              <span>Item Total</span>
              <span>{formatPrice(bill.subtotal)}</span>
            </div>
            
            <div className="bill-row">
              <span>Delivery Charge</span>
              {bill.deliveryCharge === 0 ? (
                <span className="free-delivery">FREE</span>
              ) : (
                <span>{formatPrice(bill.deliveryCharge)}</span>
              )}
            </div>

            {bill.nightCharge > 0 && (
              <div className="bill-row">
                <span>Night Charge</span>
                <span>{formatPrice(bill.nightCharge)}</span>
              </div>
            )}

            {bill.discount > 0 && (
              <div className="bill-row">
                <span>Discount</span>
                <span className="text-success">-{formatPrice(bill.discount)}</span>
              </div>
            )}

            <div className="bill-row total">
              <span>Grand Total</span>
              <span>{formatPrice(bill.grandTotal)}</span>
            </div>
          </div>
        )}

        {bill?.belowThreshold && (
          <div className="threshold-warning">
            Add {formatPrice(bill.minimumOrder - bill.subtotal)} more for FREE Delivery!
          </div>
        )}
      </div>

      <div className="cart-bottom-bar">
        <Button 
          variant="success" 
          disabled={!shopOpen || calculating || !bill}
          onClick={() => navigate('/checkout')}
        >
          {calculating ? 'Calculating...' : `Proceed to Pay (${bill ? formatPrice(bill.grandTotal) : ''})`}
        </Button>
      </div>
    </div>
  );
}
