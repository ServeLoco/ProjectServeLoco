import React, { useState, useEffect } from 'react';
import { RidersApi } from '../api';
import { readList } from '../utils/apiResponse';
import { GENERIC_ERROR } from '../utils/constants';
import './Shops.css';

export default function Riders() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRiders();
  }, []);

  const fetchRiders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await RidersApi.list();
      setRiders(readList(res, ['riders']));
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setPhone('');
    setDisplayName('');
    setDrawerOpen(true);
  };

  const createRider = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await RidersApi.create({
        phone: phone.trim(),
        displayName: displayName.trim() || undefined,
      });
      setDrawerOpen(false);
      fetchRiders();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rider) => {
    try {
      await RidersApi.update(rider.id, { active: !rider.active });
      fetchRiders();
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    }
  };

  return (
    <div className="shops-container">
      <header className="shops-header">
        <div>
          <h1 className="shops-title">Riders</h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Admin-only. Link an existing customer phone. One phone is rider <strong>or</strong> shop owner, never both.
            Delivery Available turns ON when any rider is online, OFF when none are.
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={openCreate}>
          + New Rider
        </button>
      </header>

      {error && (
        <div className="error-container" style={{ marginBottom: '1.25rem' }}>
          {error}
        </div>
      )}

      <section className="shops-table-wrapper">
        <table className="shops-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Online</th>
              <th>Heartbeat</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && riders.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                  Loading riders...
                </td>
              </tr>
            ) : riders.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                  No riders yet. Create one with a customer phone number.
                </td>
              </tr>
            ) : (
              riders.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="shop-name">{r.displayName || r.display_name}</span>
                  </td>
                  <td>{r.phone || r.userPhone || '—'}</td>
                  <td>
                    <span className={`availability-toggle ${r.isOnline || r.is_online ? 'in-stock' : 'out-of-stock'}`}>
                      {r.isOnline || r.is_online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td>
                    {r.heartbeatFresh || r.heartbeat_fresh ? 'Fresh' : 'Stale / none'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`availability-toggle ${r.active ? 'in-stock' : 'out-of-stock'}`}
                      onClick={() => toggleActive(r)}
                    >
                      {r.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      ID {r.id} · user {r.userId || r.user_id}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {drawerOpen && (
        <div className="shop-drawer-overlay" onClick={() => setDrawerOpen(false)} role="presentation">
          <div
            className="shop-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Create rider"
          >
            <header className="shop-drawer-header">
              <h2>Create rider</h2>
              <button type="button" className="btn-secondary" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </header>
            <form onSubmit={createRider} className="shop-drawer-body">
              <label className="form-label">
                Customer phone *
                <input
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Must already exist (OTP login once)"
                  required
                />
              </label>
              <label className="form-label">
                Display name
                <input
                  className="form-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Optional — defaults to user name"
                />
              </label>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create rider'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
