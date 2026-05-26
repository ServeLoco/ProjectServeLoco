import React, { useState, useEffect, useRef } from 'react';
import { OffersApi, ImagesApi } from '../api';
import { readList } from '../utils/apiResponse';
import './Offers.css';

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [storeType, setStoreType] = useState('packed');

  useEffect(() => {
    fetchOffers();
  }, [storeType]);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const res = await OffersApi.list({ store_type: storeType });
      setOffers(readList(res, ['offers']));
    } catch (err) {
      setError(err.message || 'Failed to fetch offers');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingOffer(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (offer) => {
    setEditingOffer(offer);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingOffer(null);
  };

  const toggleActive = async (offer) => {
    try {
      await OffersApi.update(offer.id, { active: !offer.active });
      fetchOffers();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  return (
    <div className="offers-container">
      <header className="offers-header">
        <h1 className="offers-title">Offers Management</h1>
        <button className="btn-primary" onClick={openCreateDrawer}>
          + New Offer
        </button>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          className={`btn-secondary ${storeType === 'packed' ? 'active' : ''}`}
          style={storeType === 'packed' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => setStoreType('packed')}
        >
          Packed Items
        </button>
        <button 
          className={`btn-secondary ${storeType === 'fast_food' ? 'active' : ''}`}
          style={storeType === 'fast_food' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => setStoreType('fast_food')}
        >
          Fast Food
        </button>
      </div>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      {loading && offers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading offers...</div>
      ) : offers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)' }}>
          No offers found. Create one to feature it on the app!
        </div>
      ) : (
        <section className="offers-grid">
          {offers.map(o => (
            <div key={o.id} className="offer-card">
              <img src={o.imageUrl || o.image_url || 'https://via.placeholder.com/400x200?text=No+Image'} alt={o.title} className="offer-image" />
              <div className="offer-content">
                <h3 className="offer-title">{o.title}</h3>
                <p className="offer-description">{o.description}</p>
                <div className="offer-footer">
                  <span className={`offer-status ${o.active ? 'active' : 'inactive'}`}>
                    {o.active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="offer-actions">
                    <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => toggleActive(o)}>
                      {o.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => openEditDrawer(o)}>
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {drawerOpen && (
        <OfferFormDrawer 
          offer={editingOffer} 
          currentMode={storeType}
          onClose={closeDrawer} 
          onSave={() => { closeDrawer(); fetchOffers(); }}
        />
      )}
    </div>
  );
}

function OfferFormDrawer({ offer, currentMode, onClose, onSave }) {
  const isEdit = !!offer;
  const [formData, setFormData] = useState(offer || {
    title: '',
    description: '',
    image_id: '',
    image_url: '',
    active: false,
    store_type: offer?.store_type || currentMode || 'packed'
  });
  
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append('image', file);

    try {
      setUploadingImage(true);
      const res = await ImagesApi.upload(data);
      const image = res.image || res.data || res;
      setFormData(prev => ({
        ...prev,
        image_id: image.id || image._id || image.image_id || '',
        image_url: image.imageUrl || image.image_url || image.url || '',
      }));
    } catch (err) {
      setFormError('Image upload failed: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setFormError(null);
      setSaving(true);
      const payload = {
        ...formData,
        imageId: formData.image_id,
        image_id: formData.image_id,
      };
      if (isEdit) {
        await OffersApi.update(offer.id, payload);
      } else {
        await OffersApi.create(payload);
      }
      onSave();
    } catch (err) {
      setFormError('Failed to save offer: ' + (err.response?.data?.message || err.message));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this offer permanently?')) return;
    try {
      setFormError(null);
      setSaving(true);
      await OffersApi.delete(offer.id);
      onSave();
    } catch (err) {
      setFormError('Delete failed: ' + (err.response?.data?.message || err.message));
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h3 className="drawer-title">{isEdit ? 'Edit Offer' : 'New Offer'}</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="drawer-body">
            {formError && <div className="error-container" style={{ marginBottom: '1rem' }}>{formError}</div>}
            <div className="form-group">
              <label className="form-label">Offer Title</label>
              <input required type="text" name="title" className="form-input" value={formData.title} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label">Offer Mode</label>
              <select required name="store_type" className="form-select" value={formData.store_type} onChange={handleChange}>
                <option value="packed">Packed Items</option>
                <option value="fast_food">Fast Food</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <textarea name="description" className="form-textarea" value={formData.description || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label">Offer Image / Banner</label>
              {(formData.image_url || formData.imageUrl) && <img src={formData.image_url || formData.imageUrl} alt="Preview" className="image-preview" />}
              <div className="image-upload-zone" onClick={() => fileInputRef.current?.click()}>
                <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
                {uploadingImage ? 'Uploading...' : 'Click to Upload Image'}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="checkbox-label" style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                <input type="checkbox" name="active" checked={Boolean(formData.active)} onChange={handleChange} />
                Activate this offer
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Note: The app may only display one active offer per mode at a time. Activating this will replace the currently displayed offer for {formData.store_type === 'fast_food' ? 'Fast Food' : 'Packed Items'}.
              </p>
            </div>
          </div>

          <div className="drawer-footer">
            {isEdit && (
              <button type="button" className="action-link danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete Offer
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || uploadingImage}>
              {saving ? 'Saving...' : 'Save Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
