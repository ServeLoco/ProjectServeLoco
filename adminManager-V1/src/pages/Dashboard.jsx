import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DashboardApi,
  SettingsApi,
  subscribeAdminOrderEvents,
  subscribeRealtimeLifecycle,
} from '../api';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const ORDER_STATUS_LABELS = {
  Pending: 'Order Placed',
  Accepted: 'Accepted',
  Preparing: 'Preparing/Packing',
  'Out for Delivery': 'Out for Delivery',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled',
};
const getOrderStatusLabel = (status) => ORDER_STATUS_LABELS[status] || status || 'Unknown';

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingShop, setTogglingShop] = useState(false);
  const refreshTimerRef = useRef(null);

  const fetchDashboardData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const res = await DashboardApi.getMetrics();
      setMetrics(res.data);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  const queueDashboardRefresh = useCallback((delay = 350) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => fetchDashboardData(false), delay);
  }, [fetchDashboardData]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  useEffect(() => {
    const unsubscribeOrders = subscribeAdminOrderEvents(() => queueDashboardRefresh());
    const unsubscribeLifecycle = subscribeRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'reconnected' || eventName === 'visible') queueDashboardRefresh();
    });
    return () => {
      unsubscribeOrders();
      unsubscribeLifecycle();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [queueDashboardRefresh]);

  const handleToggleShopStatus = async () => {
    if (!metrics) return;
    setTogglingShop(true);
    const newStatus = !metrics.shop_open;
    try {
      await SettingsApi.update({ shop_open: newStatus });
      setMetrics((prev) => ({ ...prev, shop_open: newStatus }));
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setTogglingShop(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, marginBottom: '1rem' }}>{error}</p>
        <button className="btn-primary" onClick={fetchDashboardData}>Retry</button>
      </div>
    );
  }

  if (!metrics) return null;

  const { sales = {}, latest_orders = [], product_alerts = [], top_products = [], shop_open } = metrics;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">Overview</h1>

        <div className="shop-status-card">
          <span className="status-label">Shop</span>
          <button
            className={`status-toggle ${shop_open ? 'open' : 'closed'}`}
            onClick={handleToggleShopStatus}
            disabled={togglingShop}
          >
            <span className="status-dot">●</span>
            {togglingShop ? 'Updating…' : shop_open ? 'Open' : 'Closed'}
          </button>
        </div>
      </header>

      <section className="metrics-grid">
        <div className="metric-card sales">
          <div className="metric-icon icon-sales">₹</div>
          <span className="metric-title">Today's Sales</span>
          <span className="metric-value">₹{(sales.todaySales || 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="metric-card orders">
          <div className="metric-icon icon-orders">📦</div>
          <span className="metric-title">Today's Orders</span>
          <span className="metric-value">{sales.todayOrders || 0}</span>
        </div>
        <div className="metric-card pending">
          <div className="metric-icon icon-pending">⏳</div>
          <span className="metric-title">Pending Orders</span>
          <span className="metric-value">{sales.pendingOrders || 0}</span>
        </div>
        <div className="metric-card payments">
          <div className="metric-icon icon-payments">💳</div>
          <span className="metric-title">Pending Payments</span>
          <span className="metric-value">₹{(sales.pendingPaymentTotal || 0).toLocaleString('en-IN')}</span>
        </div>
      </section>

      <div className="dashboard-content-grid">
        <section className="section-card">
          <div className="section-header">
            <h2 className="section-title">📋 Latest Orders</h2>
            <Link to="/orders" style={{ fontSize: '0.85rem', fontWeight: 700 }}>View All →</Link>
          </div>
          {latest_orders.length > 0 ? (
            <table className="latest-orders-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {latest_orders.map(order => (
                  <tr key={order.id}>
                    <td className="order-number">#{order.order_number}</td>
                    <td>{order.customer_name}</td>
                    <td style={{ fontWeight: 700 }}>₹{Number(order.total).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`status-badge ${order.status.toLowerCase().replace(/ /g, '-')}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No recent orders found.</div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <section className="section-card">
            <div className="section-header">
              <h2 className="section-title">🏆 Top Items</h2>
            </div>
            {top_products.length > 0 ? (
              <ul className="top-products-list">
                {top_products.map(prod => (
                  <li key={`${prod.product_id}-${prod.item_type}`} className="top-product-item">
                    <div className="top-product-info">
                      <span className="top-product-name">
                        {prod.product_name}
                        {prod.item_type === 'combo' && (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', background: 'var(--surface-soft)', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-secondary)', verticalAlign: 'middle' }}>
                            Combo
                          </span>
                        )}
                      </span>
                      <span className="top-product-qty">{prod.total_quantity} sold</span>
                    </div>
                    <div className="top-product-sales">₹{Number(prod.total_sales).toLocaleString('en-IN')}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state" style={{ padding: '2rem' }}>No sales data yet.</div>
            )}
          </section>

          {product_alerts.length > 0 && (
            <section className="section-card">
              <div className="section-header">
                <h2 className="section-title" style={{ color: 'var(--danger-color)' }}>⚠️ Out of Stock</h2>
              </div>
              <div className="alerts-list">
                {product_alerts.map(prod => (
                  <div key={prod.id} className="alert-item">
                    <strong>{prod.name}</strong> is currently unavailable.
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
