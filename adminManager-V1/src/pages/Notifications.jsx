import React, { useState, useEffect } from 'react';
import { NotificationsApi } from '../api';
import './Notifications.css';

export default function Notifications() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [target, setTarget] = useState('everyone');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const res = await NotificationsApi.list();
      setBroadcasts(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setErrorMsg('Title and body are required');
      return;
    }
    
    if (body.length > 240) {
      setErrorMsg('Body must be 240 characters or less');
      return;
    }

    if (!window.confirm(`Are you sure you want to send this broadcast to ${target}?`)) {
      return;
    }

    setIsSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await NotificationsApi.create({ title, body, type, target });
      setSuccessMsg(`Sent successfully to ${res.data.recipientCount} customers.`);
      setTitle('');
      setBody('');
      fetchBroadcasts();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send broadcast');
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this broadcast? It will be removed from customer inboxes.')) return;
    try {
      await NotificationsApi.delete(id);
      fetchBroadcasts();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="notifications-page">
      <header className="page-header">
        <h1 className="page-title">Broadcast Notifications</h1>
      </header>

      <div className="notifications-content">
        <div className="compose-section card">
          <h2>Send New Broadcast</h2>
          
          {errorMsg && <div className="inline-error-box">{errorMsg}</div>}
          {successMsg && <div className="inline-success-box">{successMsg}</div>}
          
          <form onSubmit={handleSend} className="compose-form">
            <div className="form-group">
              <label>Target Audience</label>
              <select value={target} onChange={e => setTarget(e.target.value)}>
                <option value="everyone">All Active Customers</option>
              </select>
            </div>

            <div className="form-group">
              <label>Notification Type</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="info">Info</option>
                <option value="offer">Offer / Promotion</option>
                <option value="success">Success</option>
                <option value="warning">Warning / Alert</option>
                <option value="admin">Admin Update</option>
              </select>
            </div>

            <div className="form-group">
              <label>Title <small>(Max 80 chars)</small></label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                maxLength={80}
                placeholder="e.g. Flash Sale Today!" 
              />
            </div>

            <div className="form-group">
              <label>Body <small>({body.length}/240 chars)</small></label>
              <textarea 
                value={body} 
                onChange={e => setBody(e.target.value)} 
                maxLength={240}
                placeholder="Type your message here..."
                rows={4}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isSending}>
              {isSending ? 'Sending...' : 'Send Broadcast'}
            </button>
          </form>
        </div>

        <div className="history-section card">
          <h2>Recent Broadcasts</h2>
          {loading ? (
            <p>Loading...</p>
          ) : broadcasts.length === 0 ? (
            <p className="empty-text">No recent broadcasts found.</p>
          ) : (
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Title & Body</th>
                    <th>Recipients</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {broadcasts.map(b => (
                    <tr key={b.id}>
                      <td>{new Date(b.created_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge badge-${b.type}`}>{b.type}</span>
                      </td>
                      <td>
                        <strong>{b.title}</strong>
                        <div className="text-muted text-sm">{b.body}</div>
                      </td>
                      <td>{b.recipient_count}</td>
                      <td>
                        <button 
                          className="btn btn-sm btn-danger-text" 
                          onClick={() => handleDelete(b.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
