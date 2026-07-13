import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { productsApi } from '../../api/productsApi';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import QuantityControl from '../../components/QuantityControl';
import ProductCard from '../../components/ProductCard';
import VariantSheet from '../../components/VariantSheet/VariantSheet';
import ErrorState from '../../components/ErrorState';
import StickyMiniCart from '../../components/StickyMiniCart';
import { formatPrice } from '../../utils/formatters';
import {
  normalizeProduct,
  isMultiVariantProduct,
  getDisplayPrice,
} from '../../utils/productUtils';
import './ProductDetailScreen.css';

import { getResolvedImageUrl, PLACEHOLDER } from '../../utils/imageUtils';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

export default function ProductDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'product';
  const isCombo = type === 'combo';

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [variantSheetOpen, setVariantSheetOpen] = useState(false);

  const shopOpen = useSettingsStore((state) => state.shopOpen);
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const addCombo = useCartStore((state) => state.addCombo);
  const updateQty = useCartStore((state) => state.updateQty);
  const getProductQuantity = useCartStore((state) => state.getProductQuantity);
  const getComboQuantity = useCartStore((state) => state.getComboQuantity);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await productsApi.getProduct(id, type);
        const payload = res.data || res;
        const raw = payload.product || payload;
        const normalized = normalizeProduct(raw);
        setProduct(normalized);
        const relatedList =
          normalized.relatedProducts?.length > 0
            ? normalized.relatedProducts
            : (payload.related || payload.similarProducts || payload.similar_products || [])
                .map(normalizeProduct);
        setRelated(relatedList);
      } catch (err) {
        setError(err.message || 'Failed to load product details');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id, type]);

  if (loading) return <div className="screen-container">Loading...</div>;
  if (error) return <div className="screen-container"><ErrorState message={error} /></div>;
  if (!product) return null;

  const multiVariant = !isCombo && isMultiVariantProduct(product);
  const quantity = isCombo
    ? getComboQuantity(product.id)
    : multiVariant
      ? getProductQuantity(product.id)
      : (cartItems.find(
          (i) =>
            i.product.id === product.id &&
            i.type === 'product' &&
            (i.variant?.id ?? null) === (product.variants?.[0]?.id ?? null)
        )?.quantity || 0);

  const findSingleVariant = () => {
    if (product.variants?.length === 1) return product.variants[0];
    const existing = cartItems.find(
      (i) => i.product.id === product.id && i.type !== 'combo'
    );
    return existing?.variant ?? product.variants?.[0] ?? null;
  };

  const handleAdd = () => {
    if (!shopOpen) return;
    if (isCombo) {
      addCombo(product, 1);
      return;
    }
    if (multiVariant) {
      setVariantSheetOpen(true);
      return;
    }
    addItem(product, 1, findSingleVariant());
  };

  const handleIncrease = () => {
    if (multiVariant) {
      setVariantSheetOpen(true);
      return;
    }
    if (isCombo) {
      addCombo(product, 1);
      return;
    }
    const variant = findSingleVariant();
    updateQty(product.id, quantity + 1, 'product', variant?.id ?? null);
  };

  const handleDecrease = () => {
    if (multiVariant) {
      setVariantSheetOpen(true);
      return;
    }
    if (isCombo) {
      updateQty(product.id, quantity - 1, 'combo');
      return;
    }
    const variant = findSingleVariant();
    updateQty(product.id, quantity - 1, 'product', variant?.id ?? null);
  };

  const imageUrl = getResolvedImageUrl(product);
  const shopClosedForItem = product.shopIsOpen === false;
  const isAvailable =
    product.available !== false &&
    product.available !== 0 &&
    !shopClosedForItem;
  const displayPrice = getDisplayPrice(product);
  const originalPrice = product.originalPrice ?? product.original_price;

  return (
    <div className="screen-container product-detail-screen">
      <div className="pd-header">
        <button className="pd-back-btn" onClick={() => navigate(-1)} type="button">
          <BackIcon />
        </button>
      </div>

      <div className="pd-scroll">
        <div className="pd-image-wrapper">
          <img
            src={imageUrl}
            alt={product.name}
            className="pd-image"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = PLACEHOLDER;
            }}
          />
        </div>

        <div className="pd-info-container">
          <div className="pd-title-row">
            <div>
              <div className="pd-name">{product.name}</div>
              {!isCombo && (
                <div className="pd-unit">
                  {multiVariant
                    ? (product.variantPrompt || product.variant_prompt || 'Choose options')
                    : (product.unit || '1 unit')}
                </div>
              )}
              {(product.discount_label || product.discountLabel) && (
                <div className="pd-discount-label">
                  {product.discount_label || product.discountLabel}
                </div>
              )}
            </div>
            <div>
              {!multiVariant && originalPrice && originalPrice > product.price && (
                <span className="pd-original-price">{formatPrice(originalPrice)}</span>
              )}
              <span className="pd-price">
                {multiVariant ? `from ${formatPrice(displayPrice)}` : formatPrice(displayPrice)}
              </span>
            </div>
          </div>

          {multiVariant && (
            <div className="pd-variants-preview">
              {product.variants.map((v) => (
                <div key={v.id} className="pd-variant-chip">
                  <span>{v.label}</span>
                  <strong>{formatPrice(v.price)}</strong>
                </div>
              ))}
            </div>
          )}

          {product.description && (
            <>
              <div className="pd-desc-title">Description</div>
              <div className="pd-description">{product.description}</div>
            </>
          )}

          {related.length > 0 && (
            <div className="pd-related">
              <div className="pd-desc-title">You may also like</div>
              <div className="pd-related-grid">
                {related.slice(0, 6).map((p) => (
                  <ProductCard key={p.id} item={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pd-bottom-bar">
        {multiVariant ? (
          <div className="pd-price">
            {quantity > 0 ? `${quantity} in cart` : `from ${formatPrice(displayPrice)}`}
          </div>
        ) : quantity > 0 ? (
          <div className="pd-qty-wrapper">
            <span className="pd-qty-label">Quantity</span>
            <QuantityControl
              quantity={quantity}
              onIncrease={handleIncrease}
              onDecrease={handleDecrease}
            />
          </div>
        ) : (
          <div className="pd-price">{formatPrice(displayPrice)}</div>
        )}

        <Button
          variant={quantity > 0 && !multiVariant ? 'highlight' : 'primary'}
          onClick={
            multiVariant
              ? () => setVariantSheetOpen(true)
              : quantity > 0
                ? () => navigate('/cart')
                : handleAdd
          }
          disabled={!shopOpen || !isAvailable}
          style={{ width: 'auto', minWidth: '140px' }}
        >
          {!isAvailable
            ? (shopClosedForItem ? 'Shop Closed' : 'Unavailable')
            : multiVariant
              ? (quantity > 0 ? 'Change options' : 'Select options')
              : quantity > 0
                ? 'Go to Cart'
                : 'Add to Cart'}
        </Button>
      </div>

      <VariantSheet
        open={variantSheetOpen}
        product={product}
        onClose={() => setVariantSheetOpen(false)}
      />
      <StickyMiniCart />
    </div>
  );
}
