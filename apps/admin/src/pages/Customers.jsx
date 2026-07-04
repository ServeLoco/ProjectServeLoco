import React, { useState, useEffect } from 'react';
import { CustomersApi } from '../api';
import MessageBanner from '../components/MessageBanner';
import { GENERIC_ERROR } from '../utils/constants';
import './Customers.css';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    trusted: '',
    blocked: ''
  });

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [resetRequests, setResetRequests] = useState([]);
  const [showResetMenu, setShowResetMenu] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(1), 500);
    return () => clearTimeout(timer);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPasswordResetRequests();
  }, []);

  // Close the reset-request dropdown when clicking outside or pressing Escape.
  useEffect(() => {
    if (!showResetMenu) return undefined;
    const handleDown = (e) => {
      if (!e.target.closest('.reset-request-pill') && !e.target.closest('.reset-request-menu')) {
        setShowResetMenu(false);
      }
    };
    const handleKey = (e) => { if (e.key === 'Escape') setShowResetMenu(false); };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showResetMenu]);

  const fetchCustomers = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, limit: 20, ...filters };
      Object.keys(params).forEach(k => params[k] === '' && delete params[k]);

      const res = await CustomersApi.list(params);
      setCustomers(res.data || []);
      if (res.pagination) {
        setPagination(res.pagination);
      }
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const fetchPasswordResetRequests = async () => {
    try {
      const res = await CustomersApi.listPasswordResetRequests({ status: 'pending' });
      setResetRequests(res.data || []);
    } catch (err) {
      console.warn('Failed to fetch password reset requests:', err);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleRowClick = async (id) => {
    try {
      setUpdating(true);
      const res = await CustomersApi.get(id);
      setSelectedCustomer(res.data);
      setDrawerOpen(true);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setUpdating(false);
    }
  };

  const handlePendingResetClick = () => {
    // Toggle a small dropdown listing every pending request so the admin can
    // pick which one to action. Previous behaviour opened only the first.
    if (resetRequests.length === 1) {
      handleRowClick(resetRequests[0].user_id);
      return;
    }
    setShowResetMenu(prev => !prev);
  };

  const getPendingResetForCustomer = (customerId) => (
    resetRequests.find(request => Number(request.user_id) === Number(customerId))
  );

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedCustomer(null);
  };

  const handleToggleTrust = async () => {
    const newStatus = !selectedCustomer.trusted;
    const action = newStatus ? 'mark this customer as trusted' : 'revoke trusted status for this customer';
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;

    try {
      setUpdating(true);
      await CustomersApi.updateTrust(selectedCustomer.id, newStatus);
      setSelectedCustomer(prev => ({ ...prev, trusted: newStatus }));
      fetchCustomers(pagination.page);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleBlock = async () => {
    const newStatus = !selectedCustomer.blocked;
    const action = newStatus
      ? 'block this customer? They will not be able to place orders.'
      : 'unblock this customer? They will be able to place orders again.';
    if (!window.confirm(`Are you sure you want to ${action}`)) return;
    try {
      setUpdating(true);
      await CustomersApi.updateBlock(selectedCustomer.id, newStatus);
      setSelectedCustomer(prev => ({ ...prev, blocked: newStatus }));
      fetchCustomers(pagination.page);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setUpdating(false);
    }
  };

  const handleReviewPasswordReset = async (action) => {
    const request = selectedCustomer?.pending_password_reset_request;
    if (!request) return;
    const isApprove = action === 'approve';
    const confirmed = isApprove
      ? window.confirm('Approving sets a password chosen by whoever filed this request. Verify with the customer (call/WhatsApp) before approving. Continue?')
      : window.confirm(`Reject password reset request for ${selectedCustomer.name}?`);
    if (!confirmed) return;

    try {
      setUpdating(true);
      if (isApprove) {
        await CustomersApi.approvePasswordReset(request.id);
      } else {
        await CustomersApi.rejectPasswordReset(request.id);
      }
      setSelectedCustomer(prev => ({ ...prev, pending_password_reset_request: null }));
      fetchPasswordResetRequests();
      setActionMessage({ type: 'success', text: `Password reset request ${isApprove ? 'approved' : 'rejected'} successfully.` });
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="customers-container">
      <header className="customers-header">
        <h1 className="customers-title">Customers</h1>
        <MessageBanner
          type={actionMessage?.type || 'info'}
          message={actionMessage?.text}
          onDismiss={() => setActionMessage(null)}
        />
        {resetRequests.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="reset-request-pill"
              onClick={handlePendingResetClick}
              disabled={updating}
              aria-haspopup={resetRequests.length > 1 ? 'true' : undefined}
              aria-expanded={showResetMenu ? 'true' : 'false'}
            >
              {resetRequests.length} pending password reset{resetRequests.length === 1 ? '' : 's'} {resetRequests.length > 1 ? '▾' : ''}
            </button>
            {showResetMenu && resetRequests.length > 1 && (
              <div
                className="reset-request-menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  background: 'var(--surface-color, #fff)',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  minWidth: 280,
                  zIndex: 50,
                  padding: 4,
                }}
                role="menu"
              >
                {resetRequests.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setShowResetMenu(false); handleRowClick(r.user_id); }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: 'var(--text-primary, #111)',
                      fontSize: '0.9rem',
                    }}
                    role="menuitem"
                  >
                    User #{r.user_id}
                    {r.user_name ? ` · ${r.user_name}` : ''}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #666)' }}>
                      {r.requested_at ? new Date(r.requested_at).toLocaleString() : ''}{r.requester_ip ? ` · IP ${r.requester_ip}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <section className="filter-bar">
        <input
          type="text"
          name="search"
          placeholder="Search by Name, Phone, or WhatsApp..."
          className="filter-input filter-search"
          value={filters.search}
          onChange={handleFilterChange}
          style={{ flex: 1, minWidth: '250px' }}
        />
        <select name="trusted" className="filter-select" value={filters.trusted} onChange={handleFilterChange}>
          <option value="">All Trust Status</option>
          <option value="1">Trusted Only</option>
          <option value="0">Not Trusted</option>
        </select>
        <select name="blocked" className="filter-select" value={filters.blocked} onChange={handleFilterChange}>
          <option value="">All Block Status</option>
          <option value="1">Blocked Only</option>
          <option value="0">Active Only</option>
        </select>
      </section>

      {error && <div className="error-container" style={{ margin: '0 0 2rem 0' }}>{error}</div>}

      <section className="customers-table-wrapper">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Orders</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && customers.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Loading customers...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No customers found.</td></tr>
            ) : (
              customers.map(c => {
                const pendingReset = getPendingResetForCustomer(c.id);
                return (
                <tr key={c.id} onClick={() => handleRowClick(c.id)}>
                  <td>
                    <div className="customer-name">
                      {c.name}
                      {c.trusted ? <span className="badge-trusted">Trusted</span> : null}
                      {c.blocked ? <span className="badge-blocked">Blocked</span> : null}
                      {pendingReset ? <span className="badge-reset">Password Reset</span> : null}
                    </div>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.order_count || c.total_orders || 0}</td>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="pagination-controls" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)' }}>
          <button className="btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => fetchCustomers(pagination.page - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button className="btn-secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => fetchCustomers(pagination.page + 1)}>Next</button>
        </div>
      </section>

      {drawerOpen && selectedCustomer && (
        <div className="drawer-overlay" onClick={closeDrawer}>
          <div className="drawer-content" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 className="drawer-title">Customer Details</h3>
              <button className="drawer-close" onClick={closeDrawer}>&times;</button>
            </div>
            
            <div className="drawer-body">
              <div className="customer-detail-header">
                <div className="customer-avatar">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{selectedCustomer.name}</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {selectedCustomer.trusted && <span className="badge-trusted">Trusted</span>}
                    {selectedCustomer.blocked && <span className="badge-blocked">Blocked</span>}
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-card-label">Total Orders</div>
                  <div className="stat-card-value">{selectedCustomer.order_count || selectedCustomer.total_orders || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Joined</div>
                  <div className="stat-card-value" style={{ fontSize: '1.2rem', marginTop: '0.25rem' }}>
                    {new Date(selectedCustomer.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="detail-section" style={{ marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>Contact Info</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Phone:</span>
                  <strong>{selectedCustomer.phone}</strong>
                </div>
                {selectedCustomer.whatsapp_number && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span>WhatsApp:</span>
                    <strong>{selectedCustomer.whatsapp_number}</strong>
                  </div>
                )}
                {(selectedCustomer.short_address || selectedCustomer.address) && (
                  <div style={{ marginTop: '1rem' }}>
                    <span style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Default Address:</span>
                    <p style={{ background: 'var(--bg-color)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.9rem' }}>
                      {selectedCustomer.short_address || selectedCustomer.address}
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <a href={`tel:${selectedCustomer.phone}`} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Call</a>
                  {selectedCustomer.whatsapp_number && (
                    <a href={`https://wa.me/${selectedCustomer.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="btn-primary" style={{ flex: 1, justifyContent: 'center', background: 'var(--whatsapp)' }}>WhatsApp</a>
                  )}
                </div>
              </div>

              <div className="action-card">
                <h4>Trust Status</h4>
                <p>Trusted customers may bypass certain verifications.</p>
                <button 
                  className="btn-secondary" 
                  style={{ width: '100%', borderColor: selectedCustomer.trusted ? 'var(--border-color)' : 'var(--success-color)', color: selectedCustomer.trusted ? 'inherit' : 'var(--success-color)' }}
                  onClick={handleToggleTrust}
                  disabled={updating}
                >
                  {selectedCustomer.trusted ? 'Revoke Trust' : 'Mark as Trusted'}
                </button>
              </div>

              {selectedCustomer.pending_password_reset_request ? (
                <div className="action-card password-reset-card">
                  <h4>Password Reset Request</h4>
                  <p>
                    Customer requested a new password on{' '}
                    {new Date(selectedCustomer.pending_password_reset_request.requested_at).toLocaleString()}.
                    {selectedCustomer.pending_password_reset_request.requester_ip && (
                      <> Request submitted from IP: <strong>{selectedCustomer.pending_password_reset_request.requester_ip}</strong>.</>
                    )}
                    {' '}Verify the customer before approving.
                  </p>
                  <div className="password-reset-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleReviewPasswordReset('approve')}
                      disabled={updating}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleReviewPasswordReset('reject')}
                      disabled={updating}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="action-card">
                  <h4>Password Reset</h4>
                  <p>No pending password reset request for this customer.</p>
                </div>
              )}

              <div className="action-card" style={{ borderColor: 'var(--danger-border)' }}>
                <h4 style={{ color: 'var(--danger-color)' }}>Block Customer</h4>
                <p>Blocked customers are immediately prevented from placing new orders.</p>
                <button 
                  className="btn-secondary" 
                  style={{ width: '100%', borderColor: selectedCustomer.blocked ? 'var(--border-color)' : 'var(--danger-color)', color: selectedCustomer.blocked ? 'inherit' : 'var(--danger-color)' }}
                  onClick={handleToggleBlock}
                  disabled={updating}
                >
                  {selectedCustomer.blocked ? 'Unblock Customer' : 'Block Customer'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
