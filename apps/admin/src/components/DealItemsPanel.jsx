import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CouponsApi, ProductsApi } from '../api';
import { readList } from '../utils/apiResponse';
import { normalizeImageUrl, FALLBACK_IMAGE, handleImageError } from '../utils/imageUrl';

// The products a deal price offer sells, grouped by deal price. Each price
// becomes a tab on the app's deal card (₹9 / ₹29 / ₹49 ...).
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
const priceInputStyle = { width: 80 };

function AddProductRow({ product, onAdd, busy }) {
  const variants = product.variants || [];
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const variant = variants.find((v) => String(v.id) === String(variantId));
  const regular = Number(variant ? variant.price : product.price);

  return (
    <div style={rowStyle}>
      <img src={normalizeImageUrl(product.imageUrl || product.image_url) || FALLBACK_IMAGE} onError={handleImageError} alt="" style={thumbStyle} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{product.name}</div>
        <div style={mutedStyle}>Normal price ₹{regular}{product.unit ? ` • ${product.unit}` : ''}</div>
      </div>
      {variants.length > 0 && (
        <select className="form-select" value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ width: 'auto' }}>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.label} (₹{v.price})</option>)}
        </select>
      )}
      <input
        type="number" min="0" step="1" placeholder="Deal ₹" className="form-input"
        value={price} onChange={(e) => setPrice(e.target.value)} style={priceInputStyle}
      />
      <button
        type="button" className="btn-secondary" disabled={busy || price === ''}
        onClick={() => onAdd({ product_id: product.id, variant_id: variant ? variant.id : null, deal_price: Number(price) })}
      >
        Add
      </button>
    </div>
  );
}

export default function DealItemsPanel({ couponId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await CouponsApi.dealItems(couponId);
      setItems(readList(res));
      setDrafts({});
    } catch (err) {
      setError(err.message || 'Could not load the deal items');
    } finally {
      setLoading(false);
    }
  }, [couponId]);

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

  const tiers = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const list = map.get(item.dealPrice) || [];
      list.push(item);
      map.set(item.dealPrice, list);
    });
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  // Moves an item within its price tab; the whole list is saved in order.
  const move = (tierItems, index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= tierItems.length) return;
    const reordered = [...tierItems];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const ids = tiers.flatMap(([, list]) => (list === tierItems ? reordered : list).map((i) => i.id));
    run(() => CouponsApi.reorderDealItems(couponId, ids));
  };

  const savePrice = (item) => {
    const value = drafts[item.id];
    if (value === undefined || value === '' || Number(value) === item.dealPrice) return;
    run(() => CouponsApi.updateDealItem(couponId, item.id, { deal_price: Number(value) }));
  };

  if (loading) return <p style={mutedStyle}>Loading deal items…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div className="coupon-form-error">{error}</div>}

      {tiers.length === 0 && (
        <p style={mutedStyle}>No items yet. Search below and give each product its deal price — every different price becomes a tab in the app.</p>
      )}

      {tiers.map(([price, tierItems]) => (
        <div key={price}>
          <div style={{ fontWeight: 600, margin: '0.25rem 0' }}>₹{price} tab · {tierItems.length} item{tierItems.length === 1 ? '' : 's'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {tierItems.map((item, index) => (
              <div key={item.id} style={{ ...rowStyle, opacity: item.active ? 1 : 0.55 }}>
                <img src={normalizeImageUrl(item.imageUrl) || FALLBACK_IMAGE} onError={handleImageError} alt="" style={thumbStyle} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}
                  </div>
                  <div style={mutedStyle}>
                    <s>₹{item.regularPrice}</s> → ₹{item.dealPrice}
                    {item.productUnavailable && <span style={warnStyle}>Product unavailable</span>}
                    {item.priceNotBelow && <span style={warnStyle}>Normal price is now lower — hidden in app</span>}
                  </div>
                </div>
                <input
                  type="number" min="0" step="1" className="form-input" style={priceInputStyle}
                  value={drafts[item.id] ?? item.dealPrice}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  onBlur={() => savePrice(item)}
                  title="Deal price"
                />
                <button type="button" className="btn-icon" disabled={busy || index === 0} onClick={() => move(tierItems, index, -1)}>▲</button>
                <button type="button" className="btn-icon" disabled={busy || index === tierItems.length - 1} onClick={() => move(tierItems, index, 1)}>▼</button>
                <button type="button" className="btn-icon" disabled={busy} onClick={() => run(() => CouponsApi.updateDealItem(couponId, item.id, { active: !item.active }))}>
                  {item.active ? 'Hide' : 'Show'}
                </button>
                <button type="button" className="btn-icon btn-icon-danger" disabled={busy} onClick={() => run(() => CouponsApi.removeDealItem(couponId, item.id))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

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
              onAdd={(data) => run(() => CouponsApi.addDealItem(couponId, data))}
            />
          ))}
          {search.trim().length >= 2 && results.length === 0 && <p style={mutedStyle}>No matching products.</p>}
        </div>
      </div>
    </div>
  );
}
