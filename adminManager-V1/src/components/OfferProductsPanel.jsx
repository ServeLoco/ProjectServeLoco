import React, { useState, useEffect } from 'react';
import { ProductsApi, OffersApi } from '../api';
import { readList } from '../utils/apiResponse';
import { normalizeImageUrl } from '../utils/imageUrl';

export default function OfferProductsPanel({ offer }) {
  const [attachedProducts, setAttachedProducts] = useState([]);
  const [candidateProducts, setCandidateProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (offer && offer.id) {
      loadData();
    }
  }, [offer]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [attachedRes, candidatesRes] = await Promise.all([
        OffersApi.listProducts(offer.id),
        ProductsApi.list({ limit: 100, is_combo: '0', available: '1', type: offer.store_type })
      ]);
      const attached = readList(attachedRes);
      setAttachedProducts(attached);
      
      const attachedIds = new Set(attached.map(p => p.id));
      const candidates = readList(candidatesRes, ['products']).filter(p => !attachedIds.has(p.id));
      setCandidateProducts(candidates);
    } catch (err) {
      console.error(err);
      alert('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleAttach = async (productId) => {
    try {
      setLoading(true);
      await OffersApi.addProduct(offer.id, productId);
      await loadData();
    } catch (err) {
      alert('Failed to attach product: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (productId) => {
    try {
      setLoading(true);
      await OffersApi.removeProduct(offer.id, productId);
      await loadData();
    } catch (err) {
      alert('Failed to remove product: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCandidates = candidateProducts.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="offer-products-panel" style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
      <h4>Attached Products ({attachedProducts.length})</h4>
      {attachedProducts.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No products attached yet.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {attachedProducts.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={normalizeImageUrl(p.imageUrl || p.image_url)} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, background: 'var(--surface-color)', border: '1px solid var(--border-color)' }} />
              <div>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ₹{p.price} • {p.category_type}
                  {(!p.available || p.deleted || p.category_type !== offer.store_type) && (
                    <span style={{ color: 'var(--danger-color)', marginLeft: '0.5rem', fontWeight: 600 }}>[Invalid]</span>
                  )}
                </div>
              </div>
            </div>
            <button type="button" className="action-link danger" onClick={() => handleRemove(p.id)} disabled={loading}>Remove</button>
          </div>
        ))}
      </div>

      <h4>Add Products</h4>
      <input 
        type="text" 
        className="form-input" 
        placeholder="Search candidates..." 
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: '1rem' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
        {filteredCandidates.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={normalizeImageUrl(p.imageUrl || p.image_url)} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4, background: 'var(--surface-color)', border: '1px solid var(--border-color)' }} />
              <div>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>₹{p.price} • {p.category_name}</div>
              </div>
            </div>
            <button type="button" className="btn-secondary" style={{ padding: '0.2rem 0.6rem' }} onClick={() => handleAttach(p.id)} disabled={loading}>Add</button>
          </div>
        ))}
        {filteredCandidates.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>No more matching candidates found.</p>}
      </div>
    </div>
  );
}
