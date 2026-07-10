import React, { useState, useEffect } from 'react';
import { ShopsApi } from '../api';
import { readList } from '../utils/apiResponse';
import { GENERIC_ERROR } from '../utils/constants';
import './Shops.css';

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingShop, setEditingShop] = useState(null);

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      setLoading(true);
      const res = await ShopsApi.list();
      setShops(readList(res, ['shops']));
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingShop(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (shop) => {
    setEditingShop(shop);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingShop(null);
  };

  const toggleActive = async (shop) => {
    try {
      await ShopsApi.update(shop.id, { active: !shop.active });
      fetchShops();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    }
  };

  const toggleOpen = async (shop) => {
    try {
      await ShopsApi.update(shop.id, { is_open: !shop.is_open });
      fetchShops();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    }
  };

  return (
    <div className="shops-container">
      <header className="shops-header">
        <h1 className="shops-title">Shops Management</h1>
        <button className="btn-primary" onClick={openCreateDrawer}>
          + New Shop
        </button>
      </header>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      <section className="shops-table-wrapper">
        <table className="shops-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Products</th>
              <th>Active</th>
              <th>Open</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && shops.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading shops...</td></tr>
            ) : shops.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No shops found.</td></tr>
            ) : (
              shops.map(s => (
                <tr key={s.id}>
                  <td><span className="shop-name">{s.name}</span></td>
                  <td>
                    {s.owner_user_id ? (
                      <span className="shop-owner">{s.owner_name || 'Unnamed'} ({s.owner_phone})</span>
                    ) : (
                      <span className="shop-owner-empty">— unassigned —</span>
                    )}
                  </td>
                  <td>{s.product_count}</td>
                  <td>
                    <button
                      className={`availability-toggle ${s.active ? 'in-stock' : 'out-of-stock'}`}
                      onClick={() => toggleActive(s)}
                    >
                      {s.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`availability-toggle ${s.is_open ? 'in-stock' : 'out-of-stock'}`}
                      onClick={() => toggleOpen(s)}
                    >
                      {s.is_open ? 'Open' : 'Closed'}
                    </button>
                  </td>
                  <td>
                    <button className="action-link" onClick={() => openEditDrawer(s)}>Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {drawerOpen && (
        <ShopFormDrawer
          shop={editingShop}
          onClose={closeDrawer}
          onSave={() => { closeDrawer(); fetchShops(); }}
        />
      )}
    </div>
  );
}

function ShopFormDrawer({ shop, onClose, onSave }) {
  const isEdit = !!shop;
  const [name, setName] = useState(shop?.name || '');
  const [ownerPhone, setOwnerPhone] = useState(shop?.owner_phone || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setFormError(null);
      setSaving(true);

      if (isEdit) {
        // PATCH only updates fields present in the payload — sending an
        // empty owner_phone here IS meaningful (clears the owner), so
        // always include it on edit.
        await ShopsApi.update(shop.id, { name, owner_phone: ownerPhone.trim() || null });
      } else {
        // On create, omit owner_phone entirely when blank rather than
        // sending '' — there's no existing owner to "clear" yet.
        const payload = { name };
        if (ownerPhone.trim()) payload.owner_phone = ownerPhone.trim();
        await ShopsApi.create(payload);
      }
      onSave();
    } catch (err) {
      console.error(err);
      setFormError(err.message || GENERIC_ERROR);
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h3 className="drawer-title">{isEdit ? 'Edit Shop' : 'New Shop'}</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>

          <div className="drawer-body">
            {formError && <div className="error-container" style={{ marginBottom: '1rem' }}>{formError}</div>}
            <div className="form-group">
              <label className="form-label">Shop Name</label>
              <input required type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Owner Phone (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="+919876543210"
                value={ownerPhone}
                onChange={e => setOwnerPhone(e.target.value)}
              />
              <p className="form-hint">
                The owner must have logged into the customer app via OTP at least once before you can assign them here.
                {isEdit && ' Clear this field to remove the current owner.'}
              </p>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Shop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
