import { useMemo } from 'react';
import { useCartStore } from '../../stores/cartStore';
import QuantityControl from '../QuantityControl';
import { formatPrice } from '../../utils/formatters';
import { getResolvedImageUrl, PLACEHOLDER } from '../../utils/imageUtils';
import './VariantSheet.css';

/**
 * Bottom sheet for multi-variant products (sizes/types).
 * Mirrors customer-app VariantSheet: each variant is its own cart line.
 */
export default function VariantSheet({ open, product, onClose }) {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);

  const variants = useMemo(
    () =>
      (product?.variants || [])
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [product]
  );

  if (!open || !product) return null;

  const quantityForVariant = (variantId) => {
    const item = items.find(
      (i) =>
        String(i.product.id) === String(product.id) &&
        i.type !== 'combo' &&
        String(i.variant?.id ?? '') === String(variantId ?? '')
    );
    return item?.quantity || 0;
  };

  const imageUrl = getResolvedImageUrl(product);

  return (
    <div className="vs-overlay" onClick={onClose} role="presentation">
      <div
        className="vs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vs-header">
          <img
            src={imageUrl}
            alt=""
            className="vs-thumb"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = PLACEHOLDER;
            }}
          />
          <div className="vs-header-text">
            <div className="vs-title">{product.name}</div>
            <div className="vs-subtitle">
              {product.variantPrompt || product.variant_prompt || 'Choose an option'}
            </div>
          </div>
          <button type="button" className="vs-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="vs-body">
          {variants.map((variant, index) => {
            const quantity = quantityForVariant(variant.id);
            const isOut = variant.available === false;
            const original = variant.originalPrice ?? variant.original_price;

            return (
              <div
                key={variant.id ?? index}
                className={`vs-row ${index === variants.length - 1 ? 'vs-row-last' : ''}`}
              >
                <div className="vs-row-text">
                  <div className={`vs-row-label ${isOut ? 'disabled' : ''}`}>
                    {variant.label}
                  </div>
                  <div className="vs-price-row">
                    <span className={`vs-row-price ${isOut ? 'disabled' : ''}`}>
                      {formatPrice(variant.price)}
                    </span>
                    {original && Number(original) > Number(variant.price) && (
                      <span className="vs-row-original">{formatPrice(original)}</span>
                    )}
                  </div>
                </div>

                {isOut ? (
                  <div className="vs-out-pill">Out</div>
                ) : quantity > 0 ? (
                  <QuantityControl
                    quantity={quantity}
                    onIncrease={() =>
                      updateQty(product.id, quantity + 1, 'product', variant.id)
                    }
                    onDecrease={() =>
                      updateQty(product.id, quantity - 1, 'product', variant.id)
                    }
                  />
                ) : (
                  <button
                    type="button"
                    className="vs-add-btn"
                    onClick={() => addItem(product, 1, variant)}
                  >
                    ADD
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
