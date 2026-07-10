import React, { useState, useEffect } from 'react';
import { StoreModesApi } from '../api';
import { readList } from '../utils/apiResponse';
import { GENERIC_ERROR } from '../utils/constants';
import './Categories.css';

export default function StoreModes() {
  const [modes, setModes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetchModes();
  }, []);

  const fetchModes = async () => {
    try {
      setLoading(true);
      const res = await StoreModesApi.list();
      setModes(readList(res, ['storeModes']));
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (mode) => {
    try {
      setError(null);
      await StoreModesApi.update(mode.id, { active: !mode.active });
      fetchModes();
    } catch (err) {
      // Deactivating a mode that still has categories/combos/offers returns a
      // 400 asking for force=true — confirm with the admin, then retry forced.
      if (mode.active && /force=true/i.test(err.message || '')) {
        const proceed = window.confirm(
          `${err.message}\n\nHide "${mode.label}" anyway? Items assigned to it will disappear from the customer apps until the mode is re-activated.`
        );
        if (proceed) {
          try {
            await StoreModesApi.update(mode.id, { active: false, force: true });
            fetchModes();
            return;
          } catch (err2) {
            console.error(err2);
            setError(err2.message || GENERIC_ERROR);
            return;
          }
        }
        return;
      }
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    }
  };

  const move = async (mode, direction) => {
    const sorted = [...modes].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex(m => m.id === mode.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      setError(null);
      await Promise.all([
        StoreModesApi.update(mode.id, { display_order: other.display_order }),
        StoreModesApi.update(other.id, { display_order: mode.display_order }),
      ]);
      fetchModes();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    }
  };

  const sortedModes = [...modes].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="categories-container">
      <header className="categories-header">
        <h1 className="categories-title">Store Modes</h1>
        <button className="btn-primary" onClick={() => setDrawerOpen(true)}>
          + New Mode
        </button>
      </header>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: '640px' }}>
        Modes power the mode-switcher capsule on the customer app home screen
        (e.g. "Packed Items", "Fast Food"). Add a new mode here, then assign
        categories/products/offers to it from their respective pages.
      </p>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      <section className="categories-table-wrapper">
        <table className="categories-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Label</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && modes.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading store modes...</td></tr>
            ) : sortedModes.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No store modes found.</td></tr>
            ) : (
              sortedModes.map((m, idx) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="action-link" disabled={idx === 0} onClick={() => move(m, -1)}>↑</button>
                      <button className="action-link" disabled={idx === sortedModes.length - 1} onClick={() => move(m, 1)}>↓</button>
                    </div>
                  </td>
                  <td>
                    <span className="category-name">{m.label}</span>
                    {m.is_system ? <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(system)</span> : null}
                  </td>
                  <td><code>{m.slug}</code></td>
                  <td>
                    <button
                      className={`availability-toggle ${m.active ? 'in-stock' : 'out-of-stock'}`}
                      onClick={() => toggleActive(m)}
                      disabled={m.is_system && m.active}
                      title={m.is_system && m.active ? 'System modes cannot be deactivated' : ''}
                    >
                      {m.active ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td>
                    <RenameAction mode={m} onSaved={fetchModes} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {drawerOpen && (
        <NewModeDrawer onClose={() => setDrawerOpen(false)} onSave={() => { setDrawerOpen(false); fetchModes(); }} />
      )}
    </div>
  );
}

function RenameAction({ mode, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(mode.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!editing) {
    return <button className="action-link" onClick={() => setEditing(true)}>Rename</button>;
  }

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await StoreModesApi.update(mode.id, { label });
      setEditing(false);
      onSaved();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
      <input
        className="form-input"
        style={{ padding: '0.25rem 0.5rem', width: '140px' }}
        value={label}
        onChange={e => setLabel(e.target.value)}
        disabled={saving}
      />
      <button className="action-link" onClick={save} disabled={saving}>Save</button>
      <button className="action-link" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
      {error && <span style={{ color: 'var(--danger-color, #d33)', fontSize: '0.75rem' }}>{error}</span>}
    </div>
  );
}

function NewModeDrawer({ onClose, onSave }) {
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleLabelChange = (value) => {
    setLabel(value);
    setSlug(prev => (prev === slugify(label) || prev === '' ? slugify(value) : prev));
  };

  const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setFormError(null);
      setSaving(true);
      await StoreModesApi.create({ slug, label });
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
            <h3 className="drawer-title">New Store Mode</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>

          <div className="drawer-body">
            {formError && <div className="error-container" style={{ marginBottom: '1rem' }}>{formError}</div>}
            <div className="form-group">
              <label className="form-label">Label (shown to customers)</label>
              <input required type="text" className="form-input" value={label} onChange={e => handleLabelChange(e.target.value)} placeholder="e.g. Bakery" />
            </div>
            <div className="form-group">
              <label className="form-label">Slug (internal, permanent)</label>
              <input required type="text" className="form-input" value={slug} onChange={e => setSlug(slugify(e.target.value))} placeholder="e.g. bakery" />
              <p className="image-dimension-hint">Lowercase letters, numbers, underscores only. Cannot be changed after creation.</p>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Mode'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
