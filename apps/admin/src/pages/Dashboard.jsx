import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DashboardApi,
  SettingsApi,
  subscribeAdminOrderEvents,
  subscribeRealtimeLifecycle,
} from '../api';
import { Link } from 'react-router-dom';
import { useAdminRefresh } from '../hooks/useAdminRefresh';
import { GENERIC_ERROR } from '../utils/constants';
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

  useAdminRefresh(fetchDashboardData);

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
      <div className="dashboard-container">
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error-state-wrapper">
          <div className="error-icon">⚠️</div>
          <h3>Failed to load dashboard</h3>
          <p>{error}</p>
          <button className="btn-primary" onClick={fetchDashboardData}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const { sales = {}, latest_orders = [], product_alerts = [], top_products = [], shop_open } = metrics;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1 className="dashboard-title">Overview</h1>
          <p className="dashboard-subtitle">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="shop-status-card">
          <span className="status-label">Shop</span>
          <button
            className={`status-toggle ${shop_open ? 'open' : 'closed'}`}
            onClick={handleToggleShopStatus}
            disabled={togglingShop}
            aria-label={shop_open ? 'Shop is open. Click to close.' : 'Shop is closed. Click to open.'}
          >
            <span className="status-dot" aria-hidden="true">●</span>
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
            <h2 className="section-title">
              <span className="section-icon">📋</span>
              Latest Orders
            </h2>
            <Link to="/orders" className="section-link">View All →</Link>
          </div>
          {latest_orders.length > 0 ? (
            <div className="table-scroll-wrapper">
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
                      <td className="order-amount">₹{Number(order.total).toLocaleString('en-IN')}</td>
                      <td>
                        <span className={`status-badge ${(order.status || 'unknown').toLowerCase().replace(/ /g, '-')}`}>
                          {getOrderStatusLabel(order.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-state-icon">📦</span>
              <span>No recent orders found</span>
            </div>
          )}
        </section>

        <div className="dashboard-sidebar-widgets">
          <section className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">🏆</span>
                Top Items
              </h2>
            </div>
            {top_products.length > 0 ? (
              <ul className="top-products-list">
                {top_products.map((prod, idx) => (
                  <li key={`${prod.product_id}-${prod.item_type}`} className="top-product-item">
                    <div className="top-product-rank">{idx + 1}</div>
                    <div className="top-product-info">
                      <span className="top-product-name">
                        {prod.product_name}
                        {prod.item_type === 'combo' && (
                          <span className="combo-tag">Combo</span>
                        )}
                      </span>
                      <span className="top-product-qty">{prod.total_quantity} sold</span>
                    </div>
                    <div className="top-product-sales">₹{Number(prod.total_sales).toLocaleString('en-IN')}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <span className="empty-state-icon">📊</span>
                <span>No sales data yet</span>
              </div>
            )}
          </section>

          {product_alerts.length > 0 && (
            <section className="section-card section-card--alert">
              <div className="section-header">
                <h2 className="section-title section-title--alert">
                  <span className="section-icon">⚠️</span>
                  Out of Stock
                  <span className="alert-count">{product_alerts.length}</span>
                </h2>
              </div>
              <div className="alerts-list">
                {product_alerts.map(prod => (
                  <div key={prod.id} className="alert-item">
                    <span className="alert-icon">🔴</span>
                    <span className="alert-text">
                      <strong>{prod.name}</strong> is currently unavailable.
                    </span>
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
