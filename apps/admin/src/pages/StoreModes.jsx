import React, { useState, useEffect } from 'react';
import { StoreModesApi } from '../api';
import { readList } from '../utils/apiResponse';
import { GENERIC_ERROR } from '../utils/constants';
import './Categories.css';
import './StoreModes.css';

const MODE_ICONS = {
  packed: '📦',
  fast_food: '🍔',
  sweets: '🍬',
  house: '🏠',
};

function modeIcon(slug) {
  return MODE_ICONS[slug] || '🔀';
}

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
        <button type="button" className="btn-primary" onClick={() => setDrawerOpen(true)}>
          + New Mode
        </button>
      </header>

      <p className="store-modes-intro">
        Modes power the <strong>mode-switcher capsule</strong> on the customer app home screen
        (e.g. Packed Items, Fast Food). Add a mode here, then assign categories, products,
        and offers to it from their respective pages.
      </p>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      <section className="categories-grid-wrapper">
        {loading && modes.length === 0 ? (
          <div className="categories-state">Loading store modes...</div>
        ) : sortedModes.length === 0 ? (
          <div className="categories-state categories-state-empty">
            <p>No store modes yet.</p>
            <button type="button" className="btn-primary" onClick={() => setDrawerOpen(true)}>
              Create your first mode
            </button>
          </div>
        ) : (
          <div className="store-modes-grid">
            {sortedModes.map((m, idx) => (
              <article
                key={m.id}
                className={`store-mode-card ${m.active ? 'store-mode-card--active' : 'store-mode-card--hidden'}`}
              >
                <div className="store-mode-card-header">
                  <div className="store-mode-card-icon-wrap">
                    <span className="store-mode-card-icon" aria-hidden="true">
                      {modeIcon(m.slug)}
                    </span>
                    <div>
                      <span className="store-mode-card-order-badge">#{m.display_order ?? idx + 1}</span>
                      <div className="store-mode-reorder">
                        <button
                          type="button"
                          className="btn-table-action"
                          disabled={idx === 0}
                          onClick={() => move(m, -1)}
                          aria-label={`Move ${m.label} up`}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-table-action"
                          disabled={idx === sortedModes.length - 1}
                          onClick={() => move(m, 1)}
                          aria-label={`Move ${m.label} down`}
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>
                  <span className={`store-mode-card-status ${m.active ? 'is-active' : 'is-hidden'}`}>
                    {m.active ? 'Active' : 'Hidden'}
                  </span>
                </div>

                <div className="store-mode-card-body">
                  <h2 className="store-mode-card-name">{m.label}</h2>
                  <p className="store-mode-card-slug">{m.slug}</p>
                  <div className="store-mode-card-meta">
                    {m.is_system ? (
                      <span className="store-mode-system-badge">System mode</span>
                    ) : (
                      <span className="store-mode-system-badge">Custom mode</span>
                    )}
                    <span className="category-card-order">Display order {m.display_order ?? 0}</span>
                  </div>
                  {m.is_system && m.active ? (
                    <p className="store-mode-card-hint">Built-in mode — cannot be hidden while active.</p>
                  ) : null}
                </div>

                <StoreModeCardFooter
                  mode={m}
                  onToggle={() => toggleActive(m)}
                  onSaved={fetchModes}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      {drawerOpen && (
        <NewModeDrawer onClose={() => setDrawerOpen(false)} onSave={() => { setDrawerOpen(false); fetchModes(); }} />
      )}
    </div>
  );
}

function StoreModeCardFooter({ mode, onToggle, onSaved }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className={`store-mode-card-footer ${editing ? 'is-editing' : ''}`}>
      {!editing ? (
        <>
          <button
            type="button"
            className={`availability-toggle ${mode.active ? 'in-stock' : 'out-of-stock'}`}
            onClick={onToggle}
            disabled={mode.is_system && mode.active}
            title={mode.is_system && mode.active ? 'System modes cannot be deactivated' : ''}
          >
            {mode.active ? 'Active' : 'Hidden'}
          </button>
          <button type="button" className="action-link" onClick={() => setEditing(true)}>
            Rename
          </button>
        </>
      ) : (
        <RenameForm
          mode={mode}
          onSaved={() => { setEditing(false); onSaved(); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function RenameForm({ mode, onSaved, onCancel }) {
  const [label, setLabel] = useState(mode.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await StoreModesApi.update(mode.id, { label });
      onSaved();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
      setSaving(false);
    }
  };

  return (
    <div className="store-mode-rename-form">
      <input
        className="form-input"
        value={label}
        onChange={e => setLabel(e.target.value)}
        disabled={saving}
        aria-label={`Rename ${mode.label}`}
      />
      <button type="button" className="action-link" onClick={save} disabled={saving}>Save</button>
      <button type="button" className="action-link" onClick={() => { onCancel(); setError(null); }} disabled={saving}>
        Cancel
      </button>
      {error && <span className="store-mode-rename-error">{error}</span>}
    </div>
  );
}

function NewModeDrawer({ onClose, onSave }) {
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const handleLabelChange = (value) => {
    setLabel(value);
    setSlug(prev => (prev === slugify(label) || prev === '' ? slugify(value) : prev));
  };

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