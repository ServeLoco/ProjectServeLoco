import React, { useState, useEffect } from 'react';
import { OrdersApi } from '../api';
import './Orders.css';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    status: '',
    paymentStatus: '',
    paymentMethod: '',
    search: '',
  });

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchOrders = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = { page, limit: 20, ...filters };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);

      const res = await OrdersApi.list(params);
      setOrders(res.data);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(1);
  }, [filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleQuickFilter = (status) => {
    setFilters(prev => ({ ...prev, status }));
  };

  const handleRowClick = async (id) => {
    try {
      setUpdating(true);
      const res = await OrdersApi.get(id);
      setSelectedOrder(res.data);
    } catch (err) {
      alert('Failed to fetch order details: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const closeDrawer = () => setSelectedOrder(null);

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (!window.confirm(`Change order status to ${newStatus}?`)) return;

    try {
      setUpdating(true);
      await OrdersApi.updateStatus(selectedOrder.id, newStatus);
      setSelectedOrder(prev => ({ ...prev, status: newStatus }));
      fetchOrders(pagination.page); // Refresh list
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handlePaymentChange = async (e) => {
    const newPayment = e.target.value;
    if (!window.confirm(`Change payment status to ${newPayment}?`)) return;

    try {
      setUpdating(true);
      await OrdersApi.updatePayment(selectedOrder.id, newPayment);
      setSelectedOrder(prev => ({ ...prev, payment_status: newPayment }));
      fetchOrders(pagination.page); // Refresh list
    } catch (err) {
      alert('Failed to update payment: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const isTerminalState = (status) => ['Delivered', 'Cancelled'].includes(status);

  return (
    <div className="orders-container">
      <header className="orders-header">
        <h1 className="orders-title">Orders Management</h1>
      </header>

      <section className="filter-bar">
        <div className="filter-row">
          <input
            type="text"
            name="search"
            placeholder="Search Order #, Name, Phone..."
            className="filter-input filter-search"
            value={filters.search}
            onChange={handleFilterChange}
          />
          <select name="status" className="filter-select" value={filters.status} onChange={handleFilterChange}>
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Preparing">Preparing</option>
            <option value="Out for Delivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select name="paymentStatus" className="filter-select" value={filters.paymentStatus} onChange={handleFilterChange}>
            <option value="">All Payment Status</option>
            <option value="Pending">Pending</option>
            <option value="Paid">Paid</option>
            <option value="Failed">Failed</option>
            <option value="Refunded">Refunded</option>
          </select>
          <select name="paymentMethod" className="filter-select" value={filters.paymentMethod} onChange={handleFilterChange}>
            <option value="">All Payment Methods</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
          </select>
        </div>
        <div className="filter-chips">
          <span className="filter-chip" onClick={() => handleQuickFilter('')}>All</span>
          <span className="filter-chip" onClick={() => handleQuickFilter('Pending')}>Pending</span>
          <span className="filter-chip" onClick={() => handleQuickFilter('Preparing')}>Preparing</span>
          <span className="filter-chip" onClick={() => handleQuickFilter('Out for Delivery')}>Out for Delivery</span>
        </div>
      </section>

      {error && <div className="error-container" style={{ margin: '0 0 2rem 0' }}>{error}</div>}

      <section className="orders-table-wrapper">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No orders found.</td></tr>
            ) : (
              orders.map(order => (
                <tr key={order.id} onClick={() => handleRowClick(order.id)}>
                  <td className="order-id">#{order.order_number}</td>
                  <td>{new Date(order.created_at).toLocaleString()}</td>
                  <td>
                    {order.customer_name}<br/>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{order.phone}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>₹{order.total}</td>
                  <td>
                    <span className={`status-badge ${order.status.toLowerCase().replace(/ /g, '-')}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{order.payment_status} ({order.payment_method})</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        <div className="pagination-controls">
          <button 
            className="pagination-btn" 
            disabled={pagination.page <= 1 || loading}
            onClick={() => fetchOrders(pagination.page - 1)}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button 
            className="pagination-btn" 
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => fetchOrders(pagination.page + 1)}
          >
            Next
          </button>
        </div>
      </section>

      {selectedOrder && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-content" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 className="drawer-title">Order #{selectedOrder.order_number}</h3>
              <button className="drawer-close" onClick={closeDrawer}>&times;</button>
            </div>
            
            <div className="drawer-body">
              <div className="detail-section">
                <h4>Customer Details</h4>
                <div className="detail-row"><span>Name:</span> <strong>{selectedOrder.customer_name}</strong></div>
                <div className="detail-row"><span>Phone:</span> <strong>{selectedOrder.phone}</strong></div>
                <div className="detail-row"><span>Address:</span> <strong>{selectedOrder.address}</strong></div>
                <div className="action-buttons">
                  {selectedOrder.phone && (
                    <a href={`https://wa.me/${selectedOrder.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="btn-whatsapp">
                      WhatsApp
                    </a>
                  )}
                  {selectedOrder.map_url && (
                    <a href={selectedOrder.map_url} target="_blank" rel="noreferrer" className="btn-map">
                      View Map
                    </a>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h4>Order Status Management</h4>
                <div className="status-update-row">
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fulfillment Status</label>
                  <select 
                    value={selectedOrder.status} 
                    onChange={handleStatusChange}
                    disabled={updating || isTerminalState(selectedOrder.status)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Preparing">Preparing</option>
                    <option value="Out for Delivery">Out for Delivery</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="status-update-row">
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Payment Status</label>
                  <select 
                    value={selectedOrder.payment_status} 
                    onChange={handlePaymentChange}
                    disabled={updating || isTerminalState(selectedOrder.status)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                    <option value="Failed">Failed</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="detail-section">
                <h4>Items</h4>
                {(selectedOrder.items || []).map((item, idx) => (
                  <div key={idx} className="item-row">
                    <span>{item.quantity}x {item.product_name}</span>
                    <strong>₹{item.line_total}</strong>
                  </div>
                ))}
                
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div className="detail-row"><span>Subtotal:</span> <strong>₹{selectedOrder.subtotal}</strong></div>
                  <div className="detail-row"><span>Delivery:</span> <strong>₹{selectedOrder.delivery_charge}</strong></div>
                  {selectedOrder.night_charge > 0 && (
                    <div className="detail-row"><span>Night Charge:</span> <strong>₹{selectedOrder.night_charge}</strong></div>
                  )}
                  <div className="detail-row" style={{ fontSize: '1.2rem', marginTop: '0.5rem' }}>
                    <span>Total:</span> <strong style={{ color: 'var(--primary-color)' }}>₹{selectedOrder.total}</strong>
                  </div>
                </div>
              </div>

              {selectedOrder.note && (
                <div className="detail-section" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'var(--warning-color)' }}>
                  <h4>Customer Note</h4>
                  <p style={{ fontSize: '0.95rem' }}>{selectedOrder.note}</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
