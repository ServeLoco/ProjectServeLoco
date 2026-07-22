import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../stores/cartStore';
import { useSettingsStore } from '../stores/settingsStore';
import QuantityControl from './QuantityControl';
import Button from './Button';
import VariantSheet from './VariantSheet/VariantSheet';
import { formatPrice } from '../utils/formatters';
import {
  normalizeProduct,
  isMultiVariantProduct,
  getDisplayPrice,
} from '../utils/productUtils';
import './ProductCard.css';

import { getResolvedImageUrl, PLACEHOLDER } from '../utils/imageUtils';

export default function ProductCard({ item, isCombo = false }) {
  const navigate = useNavigate();
  const shopOpen = useSettingsStore((state) => state.shopOpen);
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const addCombo = useCartStore((state) => state.addCombo);
  const updateQty = useCartStore((state) => state.updateQty);
  const getProductQuantity = useCartStore((state) => state.getProductQuantity);
  const getComboQuantity = useCartStore((state) => state.getComboQuantity);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);

  const product = normalizeProduct(item || {});
  const type = isCombo || product.isCombo ? 'combo' : 'product';
  const multiVariant = !isCombo && isMultiVariantProduct(product);

  const quantity = isCombo || product.isCombo
    ? getComboQuantity(product.id)
    : multiVariant
      ? getProductQuantity(product.id)
      : (cartItems.find(
          (i) =>
            i.product.id === product.id &&
            i.type === 'product' &&
            (i.variant?.id ?? null) === (product.variants?.[0]?.id ?? null)
        )?.quantity || 0);

  const handleCardClick = () => {
    navigate(`/product/${product.id}?type=${type}`);
  };

  const findSingleVariant = () => {
    if (product.variants?.length === 1) return product.variants[0];
    // Reuse cart line variant if already present
    const existing = cartItems.find(
      (i) => i.product.id === product.id && i.type !== 'combo'
    );
    return existing?.variant ?? product.variants?.[0] ?? null;
  };

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!shopOpen || product.shopIsOpen === false) return;

    if (isCombo || product.isCombo) {
      addCombo(product, 1);
      return;
    }
    if (multiVariant) {
      setVariantSheetOpen(true);
      return;
    }
    addItem(product, 1, findSingleVariant());
  };

  const handleIncrease = (e) => {
    e.stopPropagation();
    if (multiVariant) {
      setVariantSheetOpen(true);
      return;
    }
    if (isCombo || product.isCombo) {
      addCombo(product, 1);
      return;
    }
    const variant = findSingleVariant();
    const variantId = variant?.id ?? null;
    updateQty(product.id, quantity + 1, 'product', variantId);
  };

  const handleDecrease = (e) => {
    e.stopPropagation();
    if (multiVariant) {
      setVariantSheetOpen(true);
      return;
    }
    if (isCombo || product.isCombo) {
      updateQty(product.id, quantity - 1, 'combo');
      return;
    }
    const variant = findSingleVariant();
    updateQty(product.id, quantity - 1, 'product', variant?.id ?? null);
  };

  const imageUrl = getResolvedImageUrl(product);
  const displayPrice = getDisplayPrice(product);
  const originalPrice = product.originalPrice ?? product.original_price;
  const shopClosedForItem = product.shopIsOpen === false;
  const isAvailable =
    product.available !== false &&
    product.available !== 0 &&
    product.available !== null &&
    !shopClosedForItem;
  const discountLabel =
    product.discountLabel ??
    product.discount_label ??
    (originalPrice && originalPrice > product.price
      ? `${Math.round(((originalPrice - product.price) / originalPrice) * 100)}% OFF`
      : null);

  return (
    <>
      <div
        className={`product-card${!isAvailable ? ' product-card-unavailable' : ''}`}
        onClick={handleCardClick}
      >
        <div className="product-img-wrapper">
          {(isCombo || product.isCombo) && <div className="hot-badge">HOT</div>}
          {discountLabel && <div className="discount-badge">{discountLabel}</div>}
          <img
            src={imageUrl}
            alt={product.name}
            className="product-img"
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = PLACEHOLDER;
            }}
          />
          {!isAvailable && (
            <div className="product-unavailable-wash">
              <span className="product-unavailable-label">
                {shopClosedForItem ? 'Shop closed' : 'Temporarily Unavailable'}
              </span>
            </div>
          )}
        </div>
        <div className="product-info">
          <div className="product-name">{product.name}</div>
          {!isCombo && !product.isCombo && (
            <div className="product-unit">
              {multiVariant
                ? (product.variantPrompt || product.variant_prompt || 'Options available')
                : (product.unit || '1 unit')}
            </div>
          )}

          <div className="product-price-row">
            <div className="product-price-group">
              <div className="product-price">
                {multiVariant ? `from ${formatPrice(displayPrice)}` : formatPrice(displayPrice)}
              </div>
              {!multiVariant && originalPrice && originalPrice > product.price && (
                <div className="product-original-price">{formatPrice(originalPrice)}</div>
              )}
            </div>

            {!isAvailable ? (
              <div className="product-out-label">
                {shopClosedForItem ? 'Closed' : 'Out'}
              </div>
            ) : multiVariant ? (
              <Button
                variant="outline"
                className="add-btn"
                onClick={handleAdd}
                disabled={!shopOpen}
              >
                {quantity > 0 ? `${quantity} ▾` : 'ADD ▾'}
              </Button>
            ) : quantity > 0 ? (
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
                disabled={!shopOpen}
              >
                ADD
              </Button>
            )}
          </div>
        </div>
      </div>

      {multiVariant && (
        <VariantSheet
          open={variantSheetOpen}
          product={product}
          onClose={() => setVariantSheetOpen(false)}
        />
      )}
    </>
  );
}
