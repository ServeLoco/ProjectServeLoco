import React, { useState, useEffect } from 'react';
import { ReportsApi } from '../api';
import './Reports.css';

export default function Reports() {
  const [period, setPeriod] = useState('today'); // today, week, month, all
  const [salesData, setSalesData] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [customerData, setCustomerData] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReports();
  }, [period]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { period };
      
      const [salesRes, productsRes, custRes] = await Promise.all([
        ReportsApi.getSales(params).catch(() => ({ data: {} })),
        ReportsApi.getTopProducts(params).catch(() => ({ data: [] })),
        ReportsApi.getCustomers(params).catch(() => ({ data: {} }))
      ]);

      setSalesData(salesRes.data || {});
      setTopProducts(productsRes.data || []);
      setCustomerData(custRes.data || {});
    } catch (err) {
      setError('Failed to load some report data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // Generate a simple CSV for sales
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Revenue', salesData?.total_revenue || 0],
      ['Total Orders', salesData?.total_orders || 0],
      ['Delivered', salesData?.status_breakdown?.delivered || 0],
      ['Cancelled', salesData?.status_breakdown?.cancelled || 0],
      ['Paid via UPI', salesData?.payment_breakdown?.upi || 0],
      ['Paid via Cash', salesData?.payment_breakdown?.cash || 0],
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `serveloco_report_${period}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="reports-container">
      <header className="reports-header">
        <h1 className="reports-title">Reports & Analytics</h1>
        <div className="reports-controls">
          <select className="date-filter" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={loading}>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
          <button className="btn-secondary" onClick={handleExport} disabled={loading || !salesData}>
            Export CSV
          </button>
        </div>
      </header>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>Generating reports...</div>
      ) : (
        <>
          <section className="summary-grid">
            <div className="summary-card">
              <div className="summary-label">Total Revenue</div>
              <div className="summary-value">₹{salesData?.total_revenue?.toLocaleString() || 0}</div>
              <div className="summary-subtext">Across {salesData?.total_orders || 0} total orders</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Delivered Orders</div>
              <div className="summary-value">{salesData?.status_breakdown?.delivered || 0}</div>
              <div className="summary-subtext">Successful completions</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">New Customers</div>
              <div className="summary-value">{customerData?.new_customers || 0}</div>
              <div className="summary-subtext">Registered in this period</div>
            </div>
          </section>

          <div className="reports-grid">
            <div className="report-section">
              <h3 className="report-section-title">Payment Methods</h3>
              <ul className="breakdown-list">
                <li className="breakdown-item">
                  <span className="breakdown-name">UPI Payments</span>
                  <span className="breakdown-stat">{salesData?.payment_breakdown?.upi || 0} orders</span>
                </li>
                <li className="breakdown-item">
                  <span className="breakdown-name">Cash on Delivery</span>
                  <span className="breakdown-stat">{salesData?.payment_breakdown?.cash || 0} orders</span>
                </li>
              </ul>
            </div>

            <div className="report-section">
              <h3 className="report-section-title">Payment Status</h3>
              <ul className="breakdown-list">
                <li className="breakdown-item">
                  <span className="breakdown-name">Paid (Completed)</span>
                  <span className="breakdown-stat">{salesData?.payment_status?.paid || 0}</span>
                </li>
                <li className="breakdown-item">
                  <span className="breakdown-name">Pending</span>
                  <span className="breakdown-stat">{salesData?.payment_status?.pending || 0}</span>
                </li>
                <li className="breakdown-item">
                  <span className="breakdown-name">Failed / Refunded</span>
                  <span className="breakdown-stat">{(salesData?.payment_status?.failed || 0) + (salesData?.payment_status?.refunded || 0)}</span>
                </li>
              </ul>
            </div>

            <div className="report-section">
              <h3 className="report-section-title">Top Products</h3>
              {topProducts.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No product data available for this period.</p>
              ) : (
                <ul className="breakdown-list">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <li key={i} className="breakdown-item">
                      <span className="breakdown-name">{p.name || 'Unknown'}</span>
                      <span className="breakdown-stat">{p.units_sold || 0} units</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="report-section">
              <h3 className="report-section-title">Customer Trust Metrics</h3>
              <ul className="breakdown-list">
                <li className="breakdown-item">
                  <span className="breakdown-name">Trusted Customers</span>
                  <span className="breakdown-stat" style={{ color: 'var(--success-color)' }}>{customerData?.trusted_total || 0}</span>
                </li>
                <li className="breakdown-item">
                  <span className="breakdown-name">Blocked Customers</span>
                  <span className="breakdown-stat" style={{ color: 'var(--danger-color)' }}>{customerData?.blocked_total || 0}</span>
                </li>
                <li className="breakdown-item">
                  <span className="breakdown-name">Total Platform Users</span>
                  <span className="breakdown-stat">{customerData?.total_users || 0}</span>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
