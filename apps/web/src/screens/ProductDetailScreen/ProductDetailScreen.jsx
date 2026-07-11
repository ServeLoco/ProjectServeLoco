import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { productsApi } from '../../api/productsApi';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import Button from '../../components/Button';
import QuantityControl from '../../components/QuantityControl';
import ErrorState from '../../components/ErrorState';
import { formatPrice } from '../../utils/formatters';
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
  const type = searchParams.get('type') || 'product'; // 'product' or 'combo'
  const isCombo = type === 'combo';

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const shopOpen = useSettingsStore((state) => state.shopOpen);
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const addCombo = useCartStore((state) => state.addCombo);
  const updateQty = useCartStore((state) => state.updateQty);

  const cartItem = cartItems.find(i => i.product.id === parseInt(id) && i.type === type);
  const quantity = cartItem ? cartItem.quantity : 0;

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await productsApi.getProduct(id, type);
        const payload = res.data || res;
        setProduct(payload.product || payload);
      } catch (err) {
        setError(err.message || 'Failed to load product details');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id, type]);

  const handleIncrease = () => {
    updateQty(product.id, quantity + 1, type);
  };

  const handleDecrease = () => {
    updateQty(product.id, quantity - 1, type);
  };

  const handleAdd = () => {
    if (!shopOpen) return;
    if (isCombo) addCombo(product, 1);
    else addItem(product, 1);
  };

  if (loading) return <div className="screen-container">Loading...</div>;
  if (error) return <div className="screen-container"><ErrorState message={error} /></div>;
  if (!product) return null;

  const imageUrl = getResolvedImageUrl(product);
  const isAvailable = product.available !== false && product.available !== 0;

  return (
    <div className="screen-container product-detail-screen">
      <div className="pd-header">
        <button className="pd-back-btn" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
      </div>

      <div className="pd-image-wrapper">
        <img
          src={imageUrl}
          alt={product.name}
          className="pd-image"
          onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER; }}
        />
      </div>

      <div className="pd-info-container">
        <div className="pd-title-row">
          <div>
            <div className="pd-name">{product.name}</div>
            {!isCombo && <div className="pd-unit">{product.unit || '1 unit'}</div>}
            {product.discount_label && (
              <div className="pd-discount-label">{product.discount_label}</div>
            )}
          </div>
          <div>
            {product.original_price && product.original_price > product.price && (
              <span className="pd-original-price">{formatPrice(product.original_price)}</span>
            )}
            <span className="pd-price">{formatPrice(product.price)}</span>
          </div>
        </div>

        {product.description && (
          <>
            <div className="pd-desc-title">Description</div>
            <div className="pd-description">{product.description}</div>
          </>
        )}
      </div>

      <div className="pd-bottom-bar">
        {quantity > 0 ? (
          <div className="pd-qty-wrapper">
            <span className="pd-qty-label">Quantity</span>
            <QuantityControl 
              quantity={quantity} 
              onIncrease={handleIncrease} 
              onDecrease={handleDecrease} 
            />
          </div>
        ) : (
          <div className="pd-price">{formatPrice(product.price)}</div>
        )}

        <Button 
          variant={quantity > 0 ? "highlight" : "primary"} 
          onClick={quantity > 0 ? () => navigate('/cart') : handleAdd}
          disabled={!shopOpen || !isAvailable}
          style={{ width: 'auto', minWidth: '140px' }}
        >
          {quantity > 0 ? 'Go to Cart' : 'Add to Cart'}
        </Button>
      </div>
    </div>
  );
}
