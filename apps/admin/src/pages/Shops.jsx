import React, { useState, useEffect, useCallback } from 'react';
import { ShopsApi, subscribeAdminOrderEvents, subscribeRealtimeLifecycle } from '../api';
import ShopLocationPicker from '../components/ShopLocationPicker';
import { readList } from '../utils/apiResponse';
import { GENERIC_ERROR } from '../utils/constants';
import { ADMIN_ORDER_STATUS_EVENT } from '../utils/realtimeOrder';
import './Shops.css';

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Drawer state — create/edit shop
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingShop, setEditingShop] = useState(null);

  // Orders panel — shop-owner style Confirm / Ready / Cancel
  const [ordersShop, setOrdersShop] = useState(null);

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

  const openOrdersPanel = (shop) => {
    setOrdersShop(shop);
  };

  const closeOrdersPanel = () => {
    setOrdersShop(null);
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

  /** @returns {Promise<boolean>} true if deleted, false if cancelled or failed */
  const handleDeleteShop = async (shop) => {
    const label = shop?.name || `shop #${shop?.id}`;
    const ok = window.confirm(
      `Delete "${label}"?\n\nThis removes the shop. Its products move to the default home catalogue (not deleted). Active orders must be finished or cancelled first.`
    );
    if (!ok) return false;
    try {
      setError(null);
      await ShopsApi.delete(shop.id);
      if (editingShop?.id === shop.id) closeDrawer();
      if (ordersShop?.id === shop.id) closeOrdersPanel();
      fetchShops();
      return true;
    } catch (err) {
      console.error(err);
      setError(err.message || GENERIC_ERROR);
      throw err;
    }
  };

  return (
    <div className="shops-container">
      <header className="shops-header">
        <div>
          <h1 className="shops-title">Shops Management</h1>
          <p className="shops-subtitle">
            Manage shops, and confirm / ready / cancel orders on behalf of a shop owner
            (same actions as the shop-owner app popup).
          </p>
        </div>
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
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && shops.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Loading shops...</td></tr>
            ) : shops.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No shops found.</td></tr>
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
                    {(s.latitude != null && s.longitude != null) ? (
                      <span className="shop-loc-set" title={`${s.latitude}, ${s.longitude}`}>🏪 Set</span>
                    ) : (
                      <span className="shop-loc-missing">Not set</span>
                    )}
                  </td>
                  <td className="shop-actions-cell">
                    <button className="action-link action-link-orders" onClick={() => openOrdersPanel(s)}>
                      Orders
                    </button>
                    <button className="action-link" onClick={() => openEditDrawer(s)}>Edit</button>
                    <button
                      type="button"
                      className="action-link danger"
                      onClick={() => handleDeleteShop(s)}
                    >
                      Delete
                    </button>
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
          onDelete={handleDeleteShop}
        />
      )}

      {ordersShop && (
        <ShopOrdersPanel
          shop={ordersShop}
          onClose={closeOrdersPanel}
        />
      )}
    </div>
  );
}

/**
 * Side panel: this shop's Accepted/Preparing orders with the same controls as
 * the shop-owner UI — Confirm (pending), then Ready + Cancel (after confirm).
 * Admin actions write the same DB fields so the shop-owner Accept popup goes away.
 */
function ShopOrdersPanel({ shop, onClose }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({}); // { [orderId]: 'confirm' | 'ready' | 'reject' }

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await ShopsApi.listOrders(shop.id);
      setOrders(res?.orders || []);
    } catch (err) {
      setError(err.message || GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }, [shop.id]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Pure realtime: patch local queue from sockets + same-tab cancel bridge.
  // No full page refresh; silent HTTP only as reconnect reconcile.
  useEffect(() => {
    const dropOrder = (orderId) => {
      if (orderId == null) return;
      setOrders((prev) => prev.filter((o) => Number(o.id) !== Number(orderId)));
    };
    const patchOrder = (orderId, patch) => {
      if (orderId == null) return;
      setOrders((prev) => prev.map((o) => (
        Number(o.id) === Number(orderId) ? { ...o, ...patch } : o
      )));
    };

    const unsubOrders = subscribeAdminOrderEvents(({ eventName, payload }) => {
      const orderId = payload?.orderId ?? payload?.order_id ?? payload?.id;
      const status = payload?.status;
      const eventShopId = payload?.shopId ?? payload?.shop_id;
      const forThisShop = eventShopId == null || Number(eventShopId) === Number(shop.id);

      // Whole-order cancel (Orders page or auto-cancel) → leave confirm queue.
      if (
        eventName === 'admin.order.updated'
        && orderId != null
        && (status === 'Cancelled' || status === 'Canceled')
      ) {
        dropOrder(orderId);
        return;
      }

      if (!forThisShop) return;

      if (eventName === 'admin.order.shop_confirmed' && orderId != null) {
        patchOrder(orderId, { confirmed: true, rejected: false });
        return;
      }
      if (eventName === 'admin.order.shop_ready' && orderId != null) {
        patchOrder(orderId, { ready: true, confirmed: true, rejected: false });
        return;
      }
      // Shop-level reject (admin.order.updated with action rejected)
      if (
        eventName === 'admin.order.updated'
        && orderId != null
        && (payload?.action === 'rejected' || payload?.rejected === true)
      ) {
        patchOrder(orderId, { rejected: true, confirmed: false, ready: false });
        return;
      }

      // New orders assigned after accept — pull into queue without full page reload.
      if (eventName === 'admin.order.created' || eventName === 'admin.order.updated') {
        fetchOrders({ silent: true });
      }
    });

    // Same-tab: admin cancelled on Orders while this panel is open.
    const onLocalStatus = (e) => {
      const { orderId, status } = e.detail || {};
      if (status === 'Cancelled' || status === 'Canceled') {
        dropOrder(orderId);
      }
    };
    window.addEventListener(ADMIN_ORDER_STATUS_EVENT, onLocalStatus);

    const unsubLife = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'visible') {
        fetchOrders({ silent: true });
      }
    });
    return () => {
      unsubOrders();
      unsubLife();
      window.removeEventListener(ADMIN_ORDER_STATUS_EVENT, onLocalStatus);
    };
  }, [fetchOrders, shop.id]);

  const runAction = async (orderId, action) => {
    setBusy((prev) => ({ ...prev, [orderId]: action }));
    setError(null);
    try {
      if (action === 'confirm') {
        // Optimistic: move to confirmed before round-trip completes.
        setOrders((prev) => prev.map((o) => (
          Number(o.id) === Number(orderId) ? { ...o, confirmed: true, rejected: false } : o
        )));
        await ShopsApi.confirmOrder(shop.id, orderId);
      } else if (action === 'ready') {
        setOrders((prev) => prev.map((o) => (
          Number(o.id) === Number(orderId) ? { ...o, ready: true, confirmed: true } : o
        )));
        await ShopsApi.readyOrder(shop.id, orderId);
      } else if (action === 'reject') {
        const ok = window.confirm(
          "Cancel this shop's items on the order? The shop owner popup will update (same as shop-owner Cancel)."
        );
        if (!ok) return;
        setOrders((prev) => prev.map((o) => (
          Number(o.id) === Number(orderId) ? { ...o, rejected: true, confirmed: false, ready: false } : o
        )));
        await ShopsApi.rejectOrder(shop.id, orderId);
      }
    } catch (err) {
      setError(err.message || GENERIC_ERROR);
      // Roll back optimistic patch on failure.
      await fetchOrders({ silent: true });
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  // API only returns Accepted/Preparing; still ignore Cancelled if a stale
  // socket payload left one in local state for a moment.
  const live = orders.filter(
    (o) => o.status !== 'Cancelled' && o.status !== 'Canceled' && o.status !== 'Delivered'
  );
  const pending = live.filter((o) => !o.confirmed && !o.rejected);
  const active = live.filter((o) => o.confirmed && !o.rejected);
  const rejected = live.filter((o) => o.rejected);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content shop-orders-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3 className="drawer-title">{shop.name} — Orders</h3>
            <p className="shop-orders-hint">
              Confirm / Ready / Cancel matches the shop-owner app. Confirming here closes their Accept popup.
            </p>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
        </div>

        <div className="drawer-body shop-orders-body">
          {error && <div className="error-container" style={{ marginBottom: '1rem' }}>{error}</div>}

          {loading ? (
            <p className="shop-orders-empty">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="shop-orders-empty">No active orders for this shop (Accepted / Preparing only).</p>
          ) : (
            <>
              {pending.length > 0 && (
                <section className="shop-orders-section">
                  <h4 className="shop-orders-section-title">
                    Waiting to confirm
                    <span className="shop-orders-count">{pending.length}</span>
                  </h4>
                  {pending.map((order) => (
                    <ShopOrderCard
                      key={order.id}
                      order={order}
                      busy={busy[order.id]}
                      onConfirm={() => runAction(order.id, 'confirm')}
                      onReject={() => runAction(order.id, 'reject')}
                      mode="pending"
                    />
                  ))}
                </section>
              )}

              {active.length > 0 && (
                <section className="shop-orders-section">
                  <h4 className="shop-orders-section-title">
                    Preparing
                    <span className="shop-orders-count">{active.length}</span>
                  </h4>
                  {active.map((order) => (
                    <ShopOrderCard
                      key={order.id}
                      order={order}
                      busy={busy[order.id]}
                      onReady={() => runAction(order.id, 'ready')}
                      onReject={() => runAction(order.id, 'reject')}
                      mode="active"
                    />
                  ))}
                </section>
              )}

              {rejected.length > 0 && (
                <section className="shop-orders-section">
                  <h4 className="shop-orders-section-title">Rejected (waiting on admin)</h4>
                  {rejected.map((order) => (
                    <ShopOrderCard key={order.id} order={order} mode="rejected" />
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        <div className="drawer-footer">
          <button type="button" className="btn-secondary" onClick={() => fetchOrders()}>
            Refresh
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopOrderCard({ order, busy, onConfirm, onReady, onReject, mode }) {
  const items = order.items || [];
  const label = order.orderNumber || order.order_number || `#${order.id}`;
  const delivery = order.deliveryType || order.delivery_type;
  const minutes = order.expectedMinutes ?? order.expected_minutes;

  return (
    <article className={`shop-order-card shop-order-card--${mode}`}>
      <div className="shop-order-card-top">
        <div>
          <strong className="shop-order-num">{label}</strong>
          <span className="shop-order-meta">
            {order.status}
            {delivery ? ` · ${delivery}` : ''}
            {minutes != null ? ` · ~${minutes} min` : ''}
          </span>
        </div>
        {mode === 'active' && order.ready && (
          <span className="shop-order-pill shop-order-pill--ready">Ready for pickup</span>
        )}
        {mode === 'rejected' && (
          <span className="shop-order-pill shop-order-pill--reject">Rejected</span>
        )}
        {mode === 'pending' && (
          <span className="shop-order-pill shop-order-pill--wait">Needs confirm</span>
        )}
      </div>

      <ul className="shop-order-items">
        {items.map((it) => (
          <li key={it.id}>
            {it.quantity}× {it.productName || it.product_name}
            {(it.variantLabel || it.variant_label) ? ` (${it.variantLabel || it.variant_label})` : ''}
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="shop-order-note">Note: {order.note}</p>
      )}

      {mode === 'pending' && (
        <div className="shop-order-actions">
          <button
            type="button"
            className="btn-primary shop-order-btn-confirm"
            disabled={!!busy}
            onClick={onConfirm}
          >
            {busy === 'confirm' ? 'Confirming…' : 'Confirm order'}
          </button>
          <button
            type="button"
            className="btn-secondary shop-order-btn-cancel"
            disabled={!!busy}
            onClick={onReject}
          >
            {busy === 'reject' ? '…' : 'Cancel'}
          </button>
        </div>
      )}

      {mode === 'active' && !order.ready && (
        <div className="shop-order-actions">
          <button
            type="button"
            className="btn-primary shop-order-btn-ready"
            disabled={!!busy}
            onClick={onReady}
          >
            {busy === 'ready' ? 'Marking…' : 'Ready'}
          </button>
          <button
            type="button"
            className="btn-secondary shop-order-btn-cancel"
            disabled={!!busy}
            onClick={onReject}
          >
            {busy === 'reject' ? '…' : 'Cancel'}
          </button>
        </div>
      )}
    </article>
  );
}

function ShopFormDrawer({ shop, onClose, onSave, onDelete }) {
  const isEdit = !!shop;
  const [name, setName] = useState(shop?.name || '');
  const [ownerPhone, setOwnerPhone] = useState(shop?.owner_phone || '');
  const [location, setLocation] = useState(
    shop?.latitude != null && shop?.longitude != null
      ? { latitude: shop.latitude, longitude: shop.longitude }
      : null,
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setFormError(null);
      setSaving(true);

      const locPayload = location
        ? { latitude: location.latitude, longitude: location.longitude }
        : { latitude: null, longitude: null };

      if (isEdit) {
        // PATCH only updates fields present in the payload — sending an
        // empty owner_phone here IS meaningful (clears the owner), so
        // always include it on edit.
        await ShopsApi.update(shop.id, {
          name,
          owner_phone: ownerPhone.trim() || null,
          ...locPayload,
        });
      } else {
        // On create, omit owner_phone entirely when blank rather than
        // sending '' — there's no existing owner to "clear" yet.
        const payload = { name, ...locPayload };
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

  const handleDelete = async () => {
    if (!isEdit || !onDelete) return;
    try {
      setFormError(null);
      setSaving(true);
      const deleted = await onDelete(shop);
      if (!deleted) setSaving(false);
      // On success parent closes the drawer; keep saving if still open.
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

            {isEdit ? (
              <ShopLocationPicker
                shopName={name}
                value={location}
                onChange={setLocation}
              />
            ) : (
              <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
                Save the shop first, then edit to set the pickup location on the map.
              </p>
            )}

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
            {isEdit ? (
              <button
                type="button"
                className="action-link danger"
                onClick={handleDelete}
                disabled={saving}
                style={{ marginRight: 'auto' }}
              >
                Delete
              </button>
            ) : null}
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
