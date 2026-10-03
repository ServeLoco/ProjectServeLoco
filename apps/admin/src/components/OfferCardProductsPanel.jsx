import React, { useCallback, useEffect, useState } from 'react';
import { OfferCardsApi, ProductsApi } from '../api';
import { readList } from '../utils/apiResponse';
import { normalizeImageUrl, FALLBACK_IMAGE, handleImageError } from '../utils/imageUrl';

// The products a "Deals of the day" card (template 2) lists, in order. They
// sell at their own price; the MRP (original price) shows struck through.
const thumbStyle = {
  width: 40, height: 40, objectFit: 'contain', borderRadius: 4,
  background: 'var(--surface-color)', border: '1px solid var(--border-color)',
};
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '0.75rem',
  padding: '0.5rem', borderRadius: 4, border: '1px solid var(--border-color)',
};
const mutedStyle = { fontSize: '0.8rem', color: 'var(--text-secondary)' };
const warnStyle = { color: 'var(--danger-color)', fontWeight: 600, marginLeft: '0.4rem' };

const priceLine = (price, mrp) => (
  <>
    {mrp ? <s>₹{mrp}</s> : null} ₹{price}
    {!mrp && <span style={{ marginLeft: '0.4rem' }}>(no MRP set — nothing struck through)</span>}
  </>
);

function AddProductRow({ product, onAdd, busy }) {
  const variants = product.variants || [];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const variant = variants.find((v) => String(v.id) === String(variantId));
  const price = Number(variant ? variant.price : product.price);
  const mrp = Number(variant ? (variant.original_price ?? variant.originalPrice) : (product.original_price ?? product.originalPrice)) || 0;

  return (
    <div style={rowStyle}>
      <img src={normalizeImageUrl(product.imageUrl || product.image_url) || FALLBACK_IMAGE} onError={handleImageError} alt="" style={thumbStyle} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{product.name}</div>
        <div style={mutedStyle}>{priceLine(price, mrp > price ? mrp : null)}{product.unit ? ` • ${product.unit}` : ''}</div>
      </div>
      {variants.length > 0 && (
        <select className="form-select" value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ width: 'auto' }}>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.label} (₹{v.price})</option>)}
        </select>
      )}
      <button
        type="button" className="btn-secondary" disabled={busy}
        onClick={() => onAdd({ product_id: product.id, variant_id: variant ? variant.id : null })}
      >
        Add
      </button>
    </div>
  );
}

/** onChange(items) gets the list after every load, for the card preview. */
export default function OfferCardProductsPanel({ cardId, onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);

  const load = useCallback(async () => {
    try {
      const list = readList(await OfferCardsApi.products(cardId));
      setItems(list);
      onChange?.(list);
    } catch (err) {
      setError(err.message || 'Could not load the card products');
    } finally {
      setLoading(false);
    }
  }, [cardId, onChange]);

  useEffect(() => { load(); }, [load]);

  // Search the catalog as the admin types (debounced).
  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setResults([]); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const res = await ProductsApi.list({ search: query, limit: 20, is_combo: '0' });
        setResults(readList(res, ['products']));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    run(() => OfferCardsApi.reorderProducts(cardId, reordered.map((i) => i.id)));
  };

  if (loading) return <p style={mutedStyle}>Loading card products…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div className="coupon-form-error">{error}</div>}

      {items.length === 0 ? (
        <p style={mutedStyle}>No products yet. Search below and add the products this card should show — the card stays hidden in the app until it has one.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {items.map((item, index) => (
            <div key={item.id} style={{ ...rowStyle, opacity: item.productUnavailable ? 0.55 : 1 }}>
              <img src={normalizeImageUrl(item.imageUrl) || FALLBACK_IMAGE} onError={handleImageError} alt="" style={thumbStyle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>
                  {item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}
                </div>
                <div style={mutedStyle}>
                  {priceLine(item.price, item.mrp)}
                  {item.productUnavailable && <span style={warnStyle}>Unavailable — hidden in app</span>}
                </div>
              </div>
              <button type="button" className="btn-icon" disabled={busy || index === 0} onClick={() => move(index, -1)}>▲</button>
              <button type="button" className="btn-icon" disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>▼</button>
              <button type="button" className="btn-icon btn-icon-danger" disabled={busy} onClick={() => run(() => OfferCardsApi.removeProduct(cardId, item.id))}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ fontWeight: 600, margin: '0.5rem 0 0.25rem' }}>Add a product</div>
        <input
          type="text" className="form-input" placeholder="Search products by name…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
          {results.map((product) => (
            <AddProductRow
              key={product.id}
              product={product}
              busy={busy}
              onAdd={(data) => run(() => OfferCardsApi.addProduct(cardId, data))}
            />
          ))}
          {search.trim().length >= 2 && results.length === 0 && <p style={mutedStyle}>No matching products.</p>}
        </div>
      </div>
    </div>
  );
}
