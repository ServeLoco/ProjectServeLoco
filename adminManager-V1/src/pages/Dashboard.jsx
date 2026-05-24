import React, { useEffect, useState } from 'react';
import { DashboardApi, SettingsApi } from '../api';
import { Link } from 'react-router-dom';
import './Dashboard.css';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingShop, setTogglingShop] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await DashboardApi.getMetrics();
      setMetrics(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleToggleShopStatus = async () => {
    if (!metrics) return;
    setTogglingShop(true);
    const newStatus = !metrics.shop_open;
    try {
      await SettingsApi.update({ shop_open: newStatus });
      setMetrics((prev) => ({ ...prev, shop_open: newStatus }));
    } catch (err) {
      alert('Failed to update shop status: ' + (err.message || 'Unknown error'));
    } finally {
      setTogglingShop(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Oops! Something went wrong.</h3>
        <p>{error}</p>
        <button onClick={fetchDashboardData} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>Retry</button>
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
          <span className="status-label">Shop Status</span>
          <button 
            className={`status-toggle ${shop_open ? 'open' : 'closed'}`}
            onClick={handleToggleShopStatus}
            disabled={togglingShop}
          >
            <span className="status-dot">●</span>
            {shop_open ? 'Open Accepting Orders' : 'Closed'}
          </button>
        </div>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon icon-sales">₹</div>
          <span className="metric-title">Today's Sales</span>
          <span className="metric-value">₹{sales.todaySales || 0}</span>
        </div>
        <div className="metric-card">
          <div className="metric-icon icon-orders">📦</div>
          <span className="metric-title">Today's Orders</span>
          <span className="metric-value">{sales.todayOrders || 0}</span>
        </div>
        <div className="metric-card">
          <div className="metric-icon icon-pending">⏳</div>
          <span className="metric-title">Pending Orders</span>
          <span className="metric-value">{sales.pendingOrders || 0}</span>
        </div>
        <div className="metric-card">
          <div className="metric-icon icon-payments">💵</div>
          <span className="metric-title">Pending Payments</span>
          <span className="metric-value">₹{sales.pendingPaymentTotal || 0}</span>
        </div>
      </section>

      <div className="dashboard-content-grid">
        <section className="section-card">
          <div className="section-header">
            <h2 className="section-title">Latest Orders</h2>
            <Link to="/orders" style={{ fontSize: '0.9rem', fontWeight: 600 }}>View All</Link>
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
                    <td style={{ fontWeight: 600 }}>₹{order.total}</td>
                    <td>
                      <span className={`status-badge ${order.status.toLowerCase().replace(/ /g, '-')}`}>
                        {order.status}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section className="section-card">
            <div className="section-header">
              <h2 className="section-title">Top Products</h2>
            </div>
            {top_products.length > 0 ? (
              <ul className="top-products-list">
                {top_products.map(prod => (
                  <li key={prod.product_id} className="top-product-item">
                    <div className="product-info">
                      <span className="product-name">{prod.product_name}</span>
                      <span className="product-sales">₹{prod.total_sales} total</span>
                    </div>
                    <span className="product-qty">{prod.total_quantity} sold</span>
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
                <h2 className="section-title" style={{ color: 'var(--danger-color)' }}>Out of Stock Alerts</h2>
              </div>
              <div className="alerts-list">
                {product_alerts.map(prod => (
                  <div key={prod.id} className="alert-item">
                    <strong>{prod.name}</strong> is currently marked unavailable.
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
