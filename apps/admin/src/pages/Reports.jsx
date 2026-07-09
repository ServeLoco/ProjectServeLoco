import React, { useState, useEffect } from 'react';
import { ReportsApi } from '../api';
import './Reports.css';

import { GENERIC_ERROR } from '../utils/constants';
const escapeCsvCell = (value) => {
  let s = String(value ?? '');
  // Prevent formula injection: neutralize leading =,+,-,@ that spreadsheet
  // apps (Excel/LibreOffice) evaluate as formulas when a CSV is opened.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

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

      const rawSales = salesRes.data || salesRes || {};
      const revenueByPeriod = {
        today: rawSales.today ?? rawSales.today_sales,
        week: rawSales.week ?? rawSales.week_sales,
        month: rawSales.month ?? rawSales.month_sales,
        all: rawSales.total_revenue ?? rawSales.month ?? rawSales.month_sales
      };
      setSalesData({
        ...rawSales,
        total_revenue: rawSales.total_revenue ?? revenueByPeriod[period] ?? 0,
        total_orders: rawSales.total_orders ?? 0,
        status_breakdown: rawSales.status_breakdown || {},
        payment_breakdown: rawSales.payment_breakdown || {},
        payment_status: rawSales.payment_status || {},
      });
      setTopProducts(productsRes.data || []);
      const rawCustomers = custRes.data || {};
      setCustomerData({
        ...rawCustomers,
        new_customers: rawCustomers.new_customers ?? rawCustomers.new_customers_30d ?? 0,
        trusted_total: rawCustomers.trusted_total ?? rawCustomers.trusted_customers ?? 0,
        blocked_total: rawCustomers.blocked_total ?? rawCustomers.blocked_customers ?? 0,
        total_users: rawCustomers.total_users ?? rawCustomers.total_customers ?? 0,
      });
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
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
      + headers.map(escapeCsvCell).join(",") + "\n"
      + rows.map(e => e.map(escapeCsvCell).join(",")).join("\n");

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
              <h3 className="report-section-title">Top Items</h3>
              {topProducts.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No item data available for this period.</p>
              ) : (
                <ul className="breakdown-list">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <li key={`${p.product_id}-${p.item_type}`} className="breakdown-item">
                      <div className="breakdown-info">
                        <span className="breakdown-label">
                          {p.product_name}
                          {p.item_type === 'combo' && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', backgroundColor: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>Combo</span>}
                        </span>
                        <span className="breakdown-subtext">{p.total_quantity} units sold</span>
                      </div>
                      <span className="breakdown-value">₹{p.total_sales}</span>
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
