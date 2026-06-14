import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../stores/cartStore';
import { useSettingsStore } from '../stores/settingsStore';
import QuantityControl from './QuantityControl';
import Button from './Button';
import { formatPrice } from '../utils/formatters';
import './ProductCard.css';

import { getResolvedImageUrl } from '../utils/imageUtils';

export default function ProductCard({ item, isCombo = false }) {
  const navigate = useNavigate();
  const shopOpen = useSettingsStore((state) => state.shopOpen);
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const addCombo = useCartStore((state) => state.addCombo);
  const updateQty = useCartStore((state) => state.updateQty);

  const type = isCombo ? 'combo' : 'product';
  const cartItem = cartItems.find(i => i.product.id === item.id && i.type === type);
  const quantity = cartItem ? cartItem.quantity : 0;

  const handleCardClick = () => {
    navigate(`/product/${item.id}?type=${type}`);
  };

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!shopOpen) return;
    // Note: Add auth redirect logic higher up or check authStore here
    if (isCombo) {
      addCombo(item, 1);
    } else {
      addItem(item, 1);
    }
  };

  const handleIncrease = (e) => {
    e.stopPropagation();
    updateQty(item.id, quantity + 1, type);
  };

  const handleDecrease = (e) => {
    e.stopPropagation();
    updateQty(item.id, quantity - 1, type);
  };

  const imageUrl = getResolvedImageUrl(item);
  const originalPrice = item.originalPrice ?? item.original_price;
  const isAvailable = item.available !== false && item.available !== 0 && item.available !== null;
  const discountLabel =
    item.discountLabel ??
    item.discount_label ??
    (originalPrice && originalPrice > item.price
      ? `${Math.round(((originalPrice - item.price) / originalPrice) * 100)}% OFF`
      : null);

  return (
    <div className="product-card" onClick={handleCardClick}>
      <div className="product-img-wrapper">
        {isCombo && <div className="hot-badge">HOT</div>}
        {discountLabel && <div className="discount-badge">{discountLabel}</div>}
        <img src={imageUrl} alt={item.name} className="product-img" loading="lazy" />
      </div>
      <div className="product-info">
        <div className="product-name">{item.name}</div>
        {!isCombo && <div className="product-unit">{item.unit || '1 unit'}</div>}

        <div className="product-price-row">
          <div className="product-price-group">
            <div className="product-price">{formatPrice(item.price)}</div>
            {originalPrice && originalPrice > item.price && (
              <div className="product-original-price">{formatPrice(originalPrice)}</div>
            )}
          </div>

          {quantity > 0 ? (
            <QuantityControl
              quantity={quantity}
              onIncrease={handleIncrease}
              onDecrease={handleDecrease}
            />
          ) : (
            <Button
              variant="outline"
              className="add-btn"
              onClick={handleAdd}
              disabled={!shopOpen || !isAvailable}
            >
              ADD
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
