import React, { useState, useEffect, useMemo } from 'react';
import { NotificationsApi } from '../api';
import './Notifications.css';

const EMOJI_SUGGESTIONS = {
  info: ['ℹ️', '📢', '📣', '💡', '📌', '🔔'],
  offer: ['🎉', '🎊', '🔥', '⚡', '💰', '🎁', '🏷️', '💸', '✨'],
  success: ['✅', '🎊', '👍', '💚', '🌟', '🎯'],
  warning: ['⚠️', '❗', '🚨', '⛔', '❌'],
  admin: ['👨‍💼', '📋', '🔧', '⚙️', '📊']
};

const QUICK_TEMPLATES = [
  { title: '🎉 Flash Sale Alert!', body: 'Limited time offer! Get 20% off on all orders today. Order now!', type: 'offer' },
  { title: '🔥 New Items Added!', body: 'Check out our latest menu additions. Fresh and delicious!', type: 'info' },
  { title: '⚡ Free Delivery Today!', body: 'Enjoy free delivery on all orders above ₹199. Valid today only!', type: 'offer' },
  { title: '⚠️ Shop Closing Early', body: 'We will be closing at 8 PM today. Place your orders early!', type: 'warning' },
  { title: '🎊 Thank You!', body: 'Thank you for being our valued customer. Enjoy 10% off your next order!', type: 'success' }
];

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

export default function Notifications() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [target, setTarget] = useState('everyone');
  const [phonesInput, setPhonesInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTarget, setEmojiTarget] = useState('title'); // 'title' or 'body'

  // Parse + normalise the phones textarea so we can preview how many will be sent.
  const parsedPhones = useMemo(() => {
    if (target !== 'phones') return [];
    const seen = new Set();
    const out = [];
    for (const raw of String(phonesInput || '').split(/[\s,;]+/)) {
      const cleaned = String(raw || '').replace(/[^\d+]/g, '');
      const normalized = cleaned.startsWith('+') ? `+${cleaned.slice(1).replace(/\D/g, '')}` : cleaned.replace(/\D/g, '');
      if (!normalized || normalized.length < 7) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }, [phonesInput, target]);

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

    if (target === 'phones' && parsedPhones.length === 0) {
      setErrorMsg('Enter at least one phone number to send to specific customers');
      return;
    }

    const targetDescription =
      target === 'everyone'
        ? 'all active customers'
        : `${parsedPhones.length} customer${parsedPhones.length === 1 ? '' : 's'} by phone`;

    if (!window.confirm(`Are you sure you want to send this broadcast to ${targetDescription}?`)) {
      return;
    }

    setIsSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = { title, body, type, target };
      if (target === 'phones') payload.phones = parsedPhones;

      const res = await NotificationsApi.create(payload);
      const recipientCount = res?.data?.recipientCount ?? 'all';
      const matched = res?.data?.matchedPhones;
      const matchedHint = Array.isArray(matched) && matched.length
        ? ` (matched: ${matched.join(', ')})`
        : '';
      setSuccessMsg(`✅ Sent successfully to ${recipientCount} customer${recipientCount === 1 ? '' : 's'}!${matchedHint}`);
      setTitle('');
      setBody('');
      setPhonesInput('');
      fetchBroadcasts();
    } catch (err) {
      console.error(err);
      const apiMsg = err?.response?.data?.message;
      setErrorMsg(apiMsg || GENERIC_ERROR);
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
      console.error(err);
      setErrorMsg(GENERIC_ERROR);
    }
  };

  const insertEmoji = (emoji) => {
    if (emojiTarget === 'title') {
      setTitle(prev => prev + emoji);
    } else {
      setBody(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  };

  const applyTemplate = (template) => {
    setTitle(template.title);
    setBody(template.body);
    setType(template.type);
  };

  return (
    <div className="notifications-page">
      <header className="page-header">
        <h1 className="page-title">📢 Broadcast Notifications</h1>
        <p className="page-subtitle">Send instant notifications to all your customers</p>
      </header>

      <div className="notifications-content">
        <div className="compose-section card">
          <h2>✨ Send New Broadcast</h2>

          {errorMsg && <div className="inline-error-box">❌ {errorMsg}</div>}
          {successMsg && <div className="inline-success-box">{successMsg}</div>}

          {/* Quick Templates */}
          <div className="quick-templates">
            <label className="templates-label">Quick Templates:</label>
            <div className="template-chips">
              {QUICK_TEMPLATES.map((template, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="template-chip"
                  onClick={() => applyTemplate(template)}
                  title={template.body}
                >
                  {template.title}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSend} className="compose-form">
            <div className="form-row">
              <div className="form-group">
                <label>Target Audience</label>
                <select value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="everyone">👥 All Active Customers</option>
                  <option value="phones">📱 Specific Phone Numbers</option>
                </select>
              </div>

              <div className="form-group">
                <label>Notification Type</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option value="info">ℹ️ Info</option>
                  <option value="offer">🎁 Offer / Promotion</option>
                  <option value="success">✅ Success</option>
                  <option value="warning">⚠️ Warning / Alert</option>
                  <option value="admin">👨‍💼 Admin Update</option>
                </select>
              </div>
            </div>

            {target === 'phones' && (
              <div className="form-group phones-target-group">
                <label>
                  Phone Numbers
                  <small>
                    {parsedPhones.length === 0
                      ? ' — enter at least one phone, separated by commas or new lines'
                      : ` — ${parsedPhones.length} valid phone${parsedPhones.length === 1 ? '' : 's'} parsed`}
                  </small>
                </label>
                <textarea
                  className="phones-textarea"
                  rows={4}
                  value={phonesInput}
                  onChange={e => setPhonesInput(e.target.value)}
                  placeholder={'9999999001, 9999999002\n+91 9999999003'}
                />
                <div className="phones-preview">
                  {parsedPhones.length > 0 ? (
                    <span>Will send to: <strong>{parsedPhones.join(', ')}</strong></span>
                  ) : (
                    <span className="muted">No valid numbers yet — they must be 7+ digits.</span>
                  )}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Title <small>(Max 80 chars)</small></label>
              <div className="input-with-emoji">
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. 🎉 Flash Sale Today!"
                />
                <button
                  type="button"
                  className="emoji-btn"
                  onClick={() => {
                    setEmojiTarget('title');
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                  title="Add emoji"
                >
                  😊
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Body <small>({body.length}/240 chars)</small></label>
              <div className="input-with-emoji">
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  maxLength={240}
                  placeholder="Type your message here..."
                  rows={4}
                />
                <button
                  type="button"
                  className="emoji-btn"
                  onClick={() => {
                    setEmojiTarget('body');
                    setShowEmojiPicker(!showEmojiPicker);
                  }}
                  title="Add emoji"
                >
                  😊
                </button>
              </div>
            </div>

            {showEmojiPicker && (
              <div className="emoji-picker">
                <div className="emoji-picker-header">
                  <span>Suggested for {type}</span>
                  <button type="button" onClick={() => setShowEmojiPicker(false)}>✕</button>
                </div>
                <div className="emoji-grid">
                  {EMOJI_SUGGESTIONS[type]?.map((emoji, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="emoji-item"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {(title || body) && (
              <div className="notification-preview">
                <label>📱 Preview (How it will look on phone)</label>
                <div className="preview-phone">
                  <div className="preview-notification">
                    <div className="preview-app-icon">🍽️</div>
                    <div className="preview-content">
                      <div className="preview-title">{title || 'Notification Title'}</div>
                      <div className="preview-body">{body || 'Notification message will appear here'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-send" disabled={isSending}>
              {isSending ? '📤 Sending...' : '📤 Send Broadcast'}
            </button>
          </form>
        </div>

        <div className="history-section card">
          <h2>📋 Recent Broadcasts</h2>
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
                          🗑️ Delete
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
