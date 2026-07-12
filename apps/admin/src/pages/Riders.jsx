import React, { useState, useEffect, useCallback } from 'react';
import { RidersApi, subscribeRealtime, connectAdminRealtime } from '../api';
import { readList } from '../utils/apiResponse';
import { GENERIC_ERROR } from '../utils/constants';
import './Shops.css';

function mergeRiderUpdate(list, payload) {
  if (!payload || payload.id == null) return list;
  const id = Number(payload.id);
  const idx = list.findIndex((r) => Number(r.id) === id);
  if (idx < 0) {
    // New rider from another admin tab — soft-append if we have a name.
    if (payload.displayName || payload.display_name) {
      return [...list, {
        ...payload,
        isOnline: Boolean(payload.isOnline ?? payload.is_online),
        is_online: Boolean(payload.isOnline ?? payload.is_online),
        heartbeatFresh: Boolean(payload.heartbeatFresh ?? payload.heartbeat_fresh),
        heartbeat_fresh: Boolean(payload.heartbeatFresh ?? payload.heartbeat_fresh),
        active: payload.active !== undefined ? Boolean(payload.active) : true,
      }];
    }
    return list;
  }
  const next = [...list];
  const prev = next[idx];
  const isOnline = payload.isOnline !== undefined || payload.is_online !== undefined
    ? Boolean(payload.isOnline ?? payload.is_online)
    : Boolean(prev.isOnline ?? prev.is_online);
  next[idx] = {
    ...prev,
    ...payload,
    isOnline,
    is_online: isOnline,
    heartbeatFresh: payload.heartbeatFresh !== undefined || payload.heartbeat_fresh !== undefined
      ? Boolean(payload.heartbeatFresh ?? payload.heartbeat_fresh)
      : (isOnline ? true : Boolean(prev.heartbeatFresh ?? prev.heartbeat_fresh)),
    heartbeat_fresh: payload.heartbeatFresh !== undefined || payload.heartbeat_fresh !== undefined
      ? Boolean(payload.heartbeatFresh ?? payload.heartbeat_fresh)
      : (isOnline ? true : Boolean(prev.heartbeatFresh ?? prev.heartbeat_fresh)),
    active: payload.active !== undefined ? Boolean(payload.active) : prev.active,
    displayName: payload.displayName || payload.display_name || prev.displayName || prev.display_name,
    display_name: payload.displayName || payload.display_name || prev.displayName || prev.display_name,
    lastHeartbeatAt: payload.lastHeartbeatAt ?? payload.last_heartbeat_at ?? prev.lastHeartbeatAt,
    last_heartbeat_at: payload.lastHeartbeatAt ?? payload.last_heartbeat_at ?? prev.last_heartbeat_at,
  };
  return next;
}

export default function Riders() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [liveHint, setLiveHint] = useState('');

  const fetchRiders = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await RidersApi.list();
      setRiders(readList(res, ['riders']));
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRiders();
  }, [fetchRiders]);

  // Realtime online/offline + heartbeat without full page refresh.
  useEffect(() => {
    connectAdminRealtime();
    const off = subscribeRealtime('admin.rider.updated', (payload) => {
      setRiders((prev) => mergeRiderUpdate(prev, payload));
      const name = payload?.displayName || payload?.display_name || `Rider #${payload?.id}`;
      const online = Boolean(payload?.isOnline ?? payload?.is_online);
      if (payload?.reason === 'online' || payload?.reason === 'offline') {
        setLiveHint(`${name} went ${online ? 'online' : 'offline'}`);
      } else if (payload?.reason === 'heartbeat') {
        setLiveHint(`${name} heartbeat`);
      } else if (payload?.reason === 'deactivated' || payload?.reason === 'activated') {
        setLiveHint(`${name} ${payload.reason}`);
      }
    });
    // Soft re-sync when tab becomes visible / socket reconnects.
    const offVisible = subscribeRealtime('lifecycle.visible', () => fetchRiders({ silent: true }));
    const offReconn = subscribeRealtime('lifecycle.reconnected', () => fetchRiders({ silent: true }));
    return () => {
      off();
      offVisible();
      offReconn();
    };
  }, [fetchRiders]);

  useEffect(() => {
    if (!liveHint) return undefined;
    const t = setTimeout(() => setLiveHint(''), 2500);
    return () => clearTimeout(t);
  }, [liveHint]);

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

      {liveHint ? (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.55rem 0.85rem',
            borderRadius: 10,
            background: 'rgba(255, 122, 58, 0.12)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          Live · {liveHint}
        </div>
      ) : null}

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
                    <span
                      className={`availability-toggle ${r.isOnline || r.is_online ? 'in-stock' : 'out-of-stock'}`}
                      style={{ pointerEvents: 'none', cursor: 'default' }}
                    >
                      {(r.isOnline || r.is_online) ? (
                        <>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'currentColor',
                              marginRight: 6,
                              boxShadow: '0 0 0 3px rgba(31, 181, 116, 0.25)',
                            }}
                          />
                          Online
                        </>
                      ) : (
                        'Offline'
                      )}
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
