import React, { useState, useEffect } from 'react';
import { AuditApi } from '../api';
import './AuditLogs.css';

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const fetchLogs = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const res = await AuditApi.list({ page, limit: 50 });
      setLogs(res.data || []);
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

  const getActionClass = (action) => {
    if (!action) return '';
    const upperAction = action.toUpperCase();
    if (upperAction.includes('CREATE') || upperAction.includes('ADD') || upperAction.includes('UPLOAD')) return 'create';
    if (upperAction.includes('UPDATE') || upperAction.includes('EDIT') || upperAction.includes('PATCH')) return 'update';
    if (upperAction.includes('DELETE') || upperAction.includes('REMOVE') || upperAction.includes('BLOCK')) return 'delete';
    return '';
  };

  const formatDetails = (details) => {
    if (!details) return '-';
    if (typeof details === 'string') return details;
    return JSON.stringify(details);
  };

  return (
    <div className="audit-container">
      <header className="audit-header">
        <h1 className="audit-title">Admin Activity & Audit Logs</h1>
        <button className="btn-secondary" onClick={() => fetchLogs(1)} disabled={loading}>
          Refresh Logs
        </button>
      </header>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      <section className="audit-table-wrapper">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Admin / User</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Details</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No activity logs found.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id || log._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at || log.timestamp).toLocaleString()}
                  </td>
                  <td>{log.admin_email || log.admin_id || log.adminId || 'System'}</td>
                  <td>
                    <span className={`audit-action-badge ${getActionClass(log.action)}`}>
                      {log.action || `${log.method || ''} ${log.url || ''}`.trim()}
                    </span>
                  </td>
                  <td>{log.resource || log.url || '-'}</td>
                  <td>
                    <div className="audit-details">
                      {formatDetails(log.details)}
                    </div>
                  </td>
                  <td>{log.ip_address || log.ip || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="pagination-controls" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)' }}>
          <button className="btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => fetchLogs(pagination.page - 1)}>Newer</button>
          <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
          <button className="btn-secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => fetchLogs(pagination.page + 1)}>Older</button>
        </div>
      </section>
    </div>
  );
}
